import * as https from 'https';

export interface BookMetadata {
  title: string;
  author: string[];
  isbn?: string;
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories?: string[];
  thumbnail?: string;
  language?: string;
  rating?: number;
}

export class BookSearchPlugin {
  private googleApiKey?: string;
  private openLibraryEnabled: boolean;

  constructor(googleApiKey?: string) {
    this.googleApiKey = googleApiKey;
    this.openLibraryEnabled = true;
  }

  async searchByISBN(isbn: string): Promise<BookMetadata | null> {
    // Clean ISBN (remove dashes and spaces)
    const cleanISBN = isbn.replace(/[-\s]/g, '');
    
    // Try Google Books first if API key is available
    if (this.googleApiKey) {
      const googleResult = await this.searchGoogleBooks(`isbn:${cleanISBN}`);
      if (googleResult) return googleResult;
    }
    
    // Fallback to Open Library
    if (this.openLibraryEnabled) {
      const openLibResult = await this.searchOpenLibrary(cleanISBN);
      if (openLibResult) return openLibResult;
    }
    
    return null;
  }

  async searchByTitle(title: string, author?: string): Promise<BookMetadata[]> {
    const results: BookMetadata[] = [];
    
    // Build search query
    let query = title;
    if (author) {
      query += ` ${author}`;
    }
    
    // Search Google Books
    if (this.googleApiKey) {
      const googleResults = await this.searchGoogleBooksMultiple(query);
      results.push(...googleResults);
    }
    
    // Search Open Library if no Google results
    if (results.length === 0 && this.openLibraryEnabled) {
      const openLibResults = await this.searchOpenLibraryByTitle(title, author);
      results.push(...openLibResults);
    }
    
    return results;
  }

  private async searchGoogleBooks(query: string): Promise<BookMetadata | null> {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}${
      this.googleApiKey ? `&key=${this.googleApiKey}` : ''
    }`;
    
    try {
      const data = await this.fetchJSON(url);
      
      if (data.totalItems > 0 && data.items && data.items.length > 0) {
        const book = data.items[0];
        const volumeInfo = book.volumeInfo;
        
        return {
          title: volumeInfo.title,
          author: volumeInfo.authors || [],
          isbn: this.extractISBN(volumeInfo.industryIdentifiers),
          publisher: volumeInfo.publisher,
          publishedDate: volumeInfo.publishedDate,
          description: volumeInfo.description,
          pageCount: volumeInfo.pageCount,
          categories: volumeInfo.categories,
          thumbnail: volumeInfo.imageLinks?.thumbnail,
          language: volumeInfo.language,
          rating: volumeInfo.averageRating,
        };
      }
    } catch (error) {
      console.error('Google Books API error:', error);
    }
    
    return null;
  }

  private async searchGoogleBooksMultiple(query: string): Promise<BookMetadata[]> {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5${
      this.googleApiKey ? `&key=${this.googleApiKey}` : ''
    }`;
    
    const results: BookMetadata[] = [];
    
    try {
      const data = await this.fetchJSON(url);
      
      if (data.items) {
        for (const book of data.items) {
          const volumeInfo = book.volumeInfo;
          results.push({
            title: volumeInfo.title,
            author: volumeInfo.authors || [],
            isbn: this.extractISBN(volumeInfo.industryIdentifiers),
            publisher: volumeInfo.publisher,
            publishedDate: volumeInfo.publishedDate,
            description: volumeInfo.description,
            pageCount: volumeInfo.pageCount,
            categories: volumeInfo.categories,
            thumbnail: volumeInfo.imageLinks?.thumbnail,
            language: volumeInfo.language,
            rating: volumeInfo.averageRating,
          });
        }
      }
    } catch (error) {
      console.error('Google Books API error:', error);
    }
    
    return results;
  }

  private async searchOpenLibrary(isbn: string): Promise<BookMetadata | null> {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    
    try {
      const data = await this.fetchJSON(url);
      const bookKey = `ISBN:${isbn}`;
      
      if (data[bookKey]) {
        const book = data[bookKey];
        
        return {
          title: book.title,
          author: book.authors ? book.authors.map((a: any) => a.name) : [],
          isbn: isbn,
          publisher: book.publishers ? book.publishers[0].name : undefined,
          publishedDate: book.publish_date,
          description: book.excerpts ? book.excerpts[0].text : undefined,
          pageCount: book.number_of_pages,
          categories: book.subjects ? book.subjects.map((s: any) => s.name) : [],
          thumbnail: book.cover?.medium,
          language: book.languages ? book.languages[0].key.split('/').pop() : undefined,
        };
      }
    } catch (error) {
      console.error('Open Library API error:', error);
    }
    
    return null;
  }

  private async searchOpenLibraryByTitle(title: string, author?: string): Promise<BookMetadata[]> {
    let url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}`;
    if (author) {
      url += `&author=${encodeURIComponent(author)}`;
    }
    url += '&limit=5';
    
    const results: BookMetadata[] = [];
    
    try {
      const data = await this.fetchJSON(url);
      
      if (data.docs) {
        for (const doc of data.docs) {
          results.push({
            title: doc.title,
            author: doc.author_name || [],
            isbn: doc.isbn ? doc.isbn[0] : undefined,
            publisher: doc.publisher ? doc.publisher[0] : undefined,
            publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
            description: undefined, // Not available in search results
            pageCount: doc.number_of_pages_median,
            categories: doc.subject || [],
            thumbnail: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
            language: doc.language ? doc.language[0] : undefined,
          });
        }
      }
    } catch (error) {
      console.error('Open Library search error:', error);
    }
    
    return results;
  }

  private extractISBN(identifiers?: any[]): string | undefined {
    if (!identifiers) return undefined;
    
    for (const id of identifiers) {
      if (id.type === 'ISBN_13') {
        return id.identifier;
      }
    }
    
    for (const id of identifiers) {
      if (id.type === 'ISBN_10') {
        return id.identifier;
      }
    }
    
    return undefined;
  }

  private fetchJSON(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });
  }

  formatAsMarkdown(book: BookMetadata, template?: string): string {
    if (template) {
      // Process template with book metadata - template format takes precedence
      // Support multiple variable formats for compatibility
      return template
        // Basic metadata
        .replace(/\{\{title\}\}/g, book.title)
        .replace(/\{\{author\}\}/g, book.author.join(', '))
        .replace(/\{\{authors\}\}/g, book.author.join(', '))
        .replace(/\{\{isbn\}\}/g, book.isbn || '')
        .replace(/\{\{publisher\}\}/g, book.publisher || '')
        .replace(/\{\{publishedDate\}\}/g, book.publishedDate || '')
        .replace(/\{\{published_date\}\}/g, book.publishedDate || '')
        .replace(/\{\{publishDate\}\}/g, book.publishedDate || '')
        .replace(/\{\{description\}\}/g, book.description || '')
        .replace(/\{\{pageCount\}\}/g, String(book.pageCount || ''))
        .replace(/\{\{pages\}\}/g, String(book.pageCount || ''))
        .replace(/\{\{categories\}\}/g, book.categories?.join(', ') || '')
        .replace(/\{\{category\}\}/g, book.categories?.[0] || '')
        .replace(/\{\{rating\}\}/g, String(book.rating || ''))
        .replace(/\{\{thumbnail\}\}/g, book.thumbnail || '')
        .replace(/\{\{cover\}\}/g, book.thumbnail || '')
        .replace(/\{\{language\}\}/g, book.language || '')
        // Date formatting
        .replace(/\{\{date\}\}/g, new Date().toISOString().split('T')[0])
        .replace(/\{\{today\}\}/g, new Date().toISOString().split('T')[0])
        .replace(/\{\{timestamp\}\}/g, new Date().toISOString());
    }
    
    // Default format
    let markdown = `# ${book.title}\n\n`;
    
    if (book.author.length > 0) {
      markdown += `**Author(s):** ${book.author.join(', ')}\n`;
    }
    if (book.isbn) {
      markdown += `**ISBN:** ${book.isbn}\n`;
    }
    if (book.publisher) {
      markdown += `**Publisher:** ${book.publisher}\n`;
    }
    if (book.publishedDate) {
      markdown += `**Published:** ${book.publishedDate}\n`;
    }
    if (book.pageCount) {
      markdown += `**Pages:** ${book.pageCount}\n`;
    }
    if (book.categories && book.categories.length > 0) {
      markdown += `**Categories:** ${book.categories.join(', ')}\n`;
    }
    if (book.rating) {
      markdown += `**Rating:** ${book.rating}/5\n`;
    }
    
    markdown += '\n';
    
    if (book.description) {
      markdown += `## Description\n\n${book.description}\n\n`;
    }
    
    if (book.thumbnail) {
      markdown += `## Cover\n\n![Cover](${book.thumbnail})\n\n`;
    }
    
    markdown += `## Notes\n\n`;
    markdown += `### Key Takeaways\n\n- \n\n`;
    markdown += `### Quotes\n\n> \n\n`;
    markdown += `### Personal Thoughts\n\n`;
    
    return markdown;
  }
}