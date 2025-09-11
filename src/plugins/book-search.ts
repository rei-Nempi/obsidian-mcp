import * as https from 'https';
import * as fs from 'fs/promises';
import * as path from 'path';

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

export interface ReadingListItem {
  id: string;
  book: BookMetadata;
  status: 'want-to-read' | 'currently-reading' | 'read';
  dateAdded: string;
  dateStarted?: string;
  dateFinished?: string;
  personalRating?: number;
  personalNotes?: string;
  progress?: number; // for currently reading books (0-100%)
  readingGoal?: string;
  priority?: 'low' | 'medium' | 'high';
}

export class BookSearchPlugin {
  private googleApiKey?: string;
  private openLibraryEnabled: boolean;
  private openBDEnabled: boolean; // openBD API for Japanese books
  private vaultPath: string;
  private readingListPath: string;

  constructor(vaultPath: string, googleApiKey?: string) {
    this.vaultPath = vaultPath;
    this.googleApiKey = googleApiKey;
    this.openLibraryEnabled = true;
    this.openBDEnabled = true; // Enable Japanese book database by default
    this.readingListPath = path.join(vaultPath, 'Books', 'reading-list.json');
  }

  async searchByISBN(isbn: string): Promise<BookMetadata | null> {
    // Clean ISBN (remove dashes and spaces)
    const cleanISBN = isbn.replace(/[-\s]/g, '');
    
    // Try openBD first for Japanese books (if ISBN looks Japanese)
    if (this.openBDEnabled && this.isJapaneseISBN(cleanISBN)) {
      const openBDResult = await this.searchOpenBD(cleanISBN);
      if (openBDResult) return openBDResult;
    }
    
    // Try Google Books with Japanese language preference
    if (this.googleApiKey) {
      const googleResult = await this.searchGoogleBooks(`isbn:${cleanISBN}`, true);
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
    
    // Detect if query contains Japanese characters
    const hasJapanese = this.containsJapanese(query);
    
    // Search openBD first for Japanese queries
    if (hasJapanese && this.openBDEnabled) {
      const openBDResults = await this.searchOpenBDByTitle(title, author);
      results.push(...openBDResults);
    }
    
    // Search Google Books with language preference
    if (this.googleApiKey) {
      const googleResults = await this.searchGoogleBooksMultiple(query, hasJapanese);
      results.push(...googleResults);
    }
    
    // Search Open Library if no results from primary sources
    if (results.length === 0 && this.openLibraryEnabled) {
      const openLibResults = await this.searchOpenLibraryByTitle(title, author);
      results.push(...openLibResults);
    }
    
    return results;
  }

  private isJapaneseISBN(isbn: string): boolean {
    // Japanese ISBN prefixes: 978-4 (most common) and some 979 ranges
    return isbn.startsWith('9784') || isbn.startsWith('4');
  }

  private containsJapanese(text: string): boolean {
    // Check for Hiragana, Katakana, and Kanji
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
    return japaneseRegex.test(text);
  }

  private async searchOpenBD(isbn: string): Promise<BookMetadata | null> {
    const url = `https://api.openbd.jp/v1/get?isbn=${isbn}`;
    
    try {
      const data = await this.fetchJSON(url);
      
      if (data && data.length > 0 && data[0]) {
        const book = data[0];
        const summary = book.summary;
        const onix = book.onix;
        
        if (!summary) return null;
        
        return {
          title: summary.title,
          author: summary.author ? summary.author.split(',').map((a: string) => a.trim()) : [],
          isbn: summary.isbn,
          publisher: summary.publisher,
          publishedDate: summary.pubdate,
          description: onix?.CollateralDetail?.TextContent?.find((t: any) => t.TextType === '03')?.Text,
          pageCount: onix?.DescriptiveDetail?.Extent?.find((e: any) => e.ExtentType === '00')?.ExtentValue,
          categories: onix?.DescriptiveDetail?.Subject?.map((s: any) => s.SubjectHeadingText) || [],
          thumbnail: summary.cover,
          language: 'ja', // openBD is primarily Japanese
          rating: undefined,
        };
      }
    } catch (error) {
      console.error('openBD API error:', error);
    }
    
    return null;
  }

  private async searchOpenBDByTitle(title: string, author?: string): Promise<BookMetadata[]> {
    // openBD doesn't have direct title search, but we can try with known ISBNs
    // This is a limitation - for comprehensive title search, we rely on Google Books
    const results: BookMetadata[] = [];
    
    // For now, return empty array as openBD doesn't support title-based search
    // Future enhancement could include integration with other Japanese book databases
    return results;
  }

  private async searchGoogleBooks(query: string, preferJapanese: boolean = false): Promise<BookMetadata | null> {
    let url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`;
    
    // Add Japanese language preference
    if (preferJapanese) {
      url += `&langRestrict=ja&country=JP`;
    }
    
    if (this.googleApiKey) {
      url += `&key=${this.googleApiKey}`;
    }
    
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

  private async searchGoogleBooksMultiple(query: string, preferJapanese: boolean = false): Promise<BookMetadata[]> {
    let url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`;
    
    // Add Japanese language preference
    if (preferJapanese) {
      url += `&langRestrict=ja&country=JP`;
    }
    
    if (this.googleApiKey) {
      url += `&key=${this.googleApiKey}`;
    }
    
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

  /**
   * Search books by author
   */
  async searchByAuthor(author: string): Promise<BookMetadata[]> {
    const results: BookMetadata[] = [];
    const hasJapanese = this.containsJapanese(author);
    
    // Search Google Books by author with language preference
    if (this.googleApiKey) {
      const googleResults = await this.searchGoogleBooksMultiple(`inauthor:${author}`, hasJapanese);
      results.push(...googleResults);
    }
    
    // Search Open Library if no Google results
    if (results.length === 0 && this.openLibraryEnabled) {
      const openLibResults = await this.searchOpenLibraryByTitle('', author);
      results.push(...openLibResults);
    }
    
    return results;
  }

  /**
   * Search books by genre/category
   */
  async searchByGenre(genre: string): Promise<BookMetadata[]> {
    const results: BookMetadata[] = [];
    const hasJapanese = this.containsJapanese(genre);
    
    // Search Google Books by subject/category with language preference
    if (this.googleApiKey) {
      const googleResults = await this.searchGoogleBooksMultiple(`subject:${genre}`, hasJapanese);
      results.push(...googleResults);
    }
    
    // Search Open Library by subject
    if (results.length === 0 && this.openLibraryEnabled) {
      try {
        const url = `https://openlibrary.org/search.json?subject=${encodeURIComponent(genre)}&limit=10`;
        const data = await this.fetchJSON(url);
        
        if (data.docs) {
          for (const doc of data.docs) {
            results.push({
              title: doc.title,
              author: doc.author_name || [],
              isbn: doc.isbn ? doc.isbn[0] : undefined,
              publisher: doc.publisher ? doc.publisher[0] : undefined,
              publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
              description: undefined,
              pageCount: doc.number_of_pages_median,
              categories: doc.subject || [],
              thumbnail: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
              language: doc.language ? doc.language[0] : undefined,
            });
          }
        }
      } catch (error) {
        console.error('Genre search error:', error);
      }
    }
    
    return results;
  }

  /**
   * Get book recommendations based on a book or author
   */
  async getBookRecommendations(seedTitle?: string, seedAuthor?: string): Promise<BookMetadata[]> {
    const results: BookMetadata[] = [];
    
    try {
      // Get recommendations from similar books or authors
      let query = '';
      if (seedTitle) query += seedTitle;
      if (seedAuthor) query += ` ${seedAuthor}`;
      
      const hasJapanese = this.containsJapanese(query);
      
      if (query) {
        // First, find the seed book to get its categories
        const seedBooks = await this.searchByTitle(seedTitle || '', seedAuthor);
        if (seedBooks.length > 0 && seedBooks[0].categories) {
          // Search for books in the same categories
          for (const category of seedBooks[0].categories.slice(0, 2)) {
            const categoryBooks = await this.searchByGenre(category);
            results.push(...categoryBooks.slice(0, 3));
            if (results.length >= 10) break;
          }
        }
      } else {
        // General recommendations (popular books)
        if (this.googleApiKey) {
          const popularBooks = await this.searchGoogleBooksMultiple('bestseller', hasJapanese);
          results.push(...popularBooks);
        }
      }
    } catch (error) {
      console.error('Recommendation error:', error);
    }
    
    return results.slice(0, 10);
  }

  /**
   * Create or get reading list
   */
  async createReadingList(): Promise<ReadingListItem[]> {
    try {
      // Ensure Books directory exists
      const booksDir = path.join(this.vaultPath, 'Books');
      await fs.mkdir(booksDir, { recursive: true });
      
      // Try to read existing reading list
      try {
        const content = await fs.readFile(this.readingListPath, 'utf-8');
        return JSON.parse(content);
      } catch {
        // Create new reading list if doesn't exist
        const emptyList: ReadingListItem[] = [];
        await fs.writeFile(this.readingListPath, JSON.stringify(emptyList, null, 2));
        return emptyList;
      }
    } catch (error) {
      throw new Error(`Failed to create reading list: ${error}`);
    }
  }

  /**
   * Add book to reading list
   */
  async addBookToReadingList(
    book: BookMetadata,
    status: 'want-to-read' | 'currently-reading' | 'read' = 'want-to-read',
    priority: 'low' | 'medium' | 'high' = 'medium',
    readingGoal?: string
  ): Promise<ReadingListItem> {
    try {
      const readingList = await this.createReadingList();
      
      // Generate unique ID
      const id = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newItem: ReadingListItem = {
        id,
        book,
        status,
        dateAdded: new Date().toISOString().split('T')[0],
        priority,
        readingGoal,
        progress: status === 'currently-reading' ? 0 : undefined,
      };
      
      if (status === 'currently-reading') {
        newItem.dateStarted = new Date().toISOString().split('T')[0];
      } else if (status === 'read') {
        newItem.dateStarted = new Date().toISOString().split('T')[0];
        newItem.dateFinished = new Date().toISOString().split('T')[0];
        newItem.progress = 100;
      }
      
      readingList.push(newItem);
      await fs.writeFile(this.readingListPath, JSON.stringify(readingList, null, 2));
      
      return newItem;
    } catch (error) {
      throw new Error(`Failed to add book to reading list: ${error}`);
    }
  }

  /**
   * Mark book as read
   */
  async markBookAsRead(bookId: string, personalRating?: number, personalNotes?: string): Promise<boolean> {
    try {
      const readingList = await this.createReadingList();
      const bookItem = readingList.find(item => item.id === bookId);
      
      if (!bookItem) {
        throw new Error('Book not found in reading list');
      }
      
      bookItem.status = 'read';
      bookItem.dateFinished = new Date().toISOString().split('T')[0];
      bookItem.progress = 100;
      
      if (!bookItem.dateStarted) {
        bookItem.dateStarted = new Date().toISOString().split('T')[0];
      }
      
      if (personalRating !== undefined) {
        bookItem.personalRating = personalRating;
      }
      
      if (personalNotes) {
        bookItem.personalNotes = personalNotes;
      }
      
      await fs.writeFile(this.readingListPath, JSON.stringify(readingList, null, 2));
      
      return true;
    } catch (error) {
      throw new Error(`Failed to mark book as read: ${error}`);
    }
  }

  /**
   * Get reading progress
   */
  async getReadingProgress(): Promise<{
    totalBooks: number;
    wantToRead: number;
    currentlyReading: ReadingListItem[];
    completedBooks: ReadingListItem[];
    completedThisYear: number;
    averageRating: number;
    readingStats: {
      totalPages: number;
      averagePages: number;
      monthlyStats: { [month: string]: number };
    };
  }> {
    try {
      const readingList = await this.createReadingList();
      const currentYear = new Date().getFullYear().toString();
      
      const wantToRead = readingList.filter(item => item.status === 'want-to-read').length;
      const currentlyReading = readingList.filter(item => item.status === 'currently-reading');
      const completedBooks = readingList.filter(item => item.status === 'read');
      const completedThisYear = completedBooks.filter(item => 
        item.dateFinished?.startsWith(currentYear)
      ).length;
      
      const ratingsSum = completedBooks
        .filter(item => item.personalRating)
        .reduce((sum, item) => sum + (item.personalRating || 0), 0);
      const ratingsCount = completedBooks.filter(item => item.personalRating).length;
      const averageRating = ratingsCount > 0 ? ratingsSum / ratingsCount : 0;
      
      const totalPages = completedBooks.reduce((sum, item) => 
        sum + (item.book.pageCount || 0), 0
      );
      const averagePages = completedBooks.length > 0 ? totalPages / completedBooks.length : 0;
      
      // Monthly stats for current year
      const monthlyStats: { [month: string]: number } = {};
      for (let month = 1; month <= 12; month++) {
        const monthStr = `${currentYear}-${month.toString().padStart(2, '0')}`;
        monthlyStats[monthStr] = completedBooks.filter(item =>
          item.dateFinished?.startsWith(monthStr)
        ).length;
      }
      
      return {
        totalBooks: readingList.length,
        wantToRead,
        currentlyReading,
        completedBooks,
        completedThisYear,
        averageRating,
        readingStats: {
          totalPages,
          averagePages,
          monthlyStats,
        },
      };
    } catch (error) {
      throw new Error(`Failed to get reading progress: ${error}`);
    }
  }

  /**
   * Rate a book
   */
  async rateBook(bookId: string, rating: number, notes?: string): Promise<boolean> {
    try {
      if (rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }
      
      const readingList = await this.createReadingList();
      const bookItem = readingList.find(item => item.id === bookId);
      
      if (!bookItem) {
        throw new Error('Book not found in reading list');
      }
      
      bookItem.personalRating = rating;
      if (notes) {
        bookItem.personalNotes = notes;
      }
      
      await fs.writeFile(this.readingListPath, JSON.stringify(readingList, null, 2));
      
      return true;
    } catch (error) {
      throw new Error(`Failed to rate book: ${error}`);
    }
  }

  /**
   * Add notes to a book
   */
  async addBookNotes(bookId: string, notes: string): Promise<boolean> {
    try {
      const readingList = await this.createReadingList();
      const bookItem = readingList.find(item => item.id === bookId);
      
      if (!bookItem) {
        throw new Error('Book not found in reading list');
      }
      
      bookItem.personalNotes = notes;
      await fs.writeFile(this.readingListPath, JSON.stringify(readingList, null, 2));
      
      return true;
    } catch (error) {
      throw new Error(`Failed to add notes to book: ${error}`);
    }
  }

  /**
   * Search personal library
   */
  async searchPersonalLibrary(query: string): Promise<ReadingListItem[]> {
    try {
      const readingList = await this.createReadingList();
      const lowerQuery = query.toLowerCase();
      
      return readingList.filter(item => 
        item.book.title.toLowerCase().includes(lowerQuery) ||
        item.book.author.some(author => author.toLowerCase().includes(lowerQuery)) ||
        item.book.categories?.some(category => category.toLowerCase().includes(lowerQuery)) ||
        (item.personalNotes && item.personalNotes.toLowerCase().includes(lowerQuery))
      );
    } catch (error) {
      throw new Error(`Failed to search personal library: ${error}`);
    }
  }

  /**
   * Export reading data
   */
  async exportReadingData(format: 'json' | 'csv' | 'markdown' = 'json'): Promise<string> {
    try {
      const readingList = await this.createReadingList();
      const progress = await this.getReadingProgress();
      
      if (format === 'json') {
        return JSON.stringify({
          readingList,
          progress,
          exportDate: new Date().toISOString(),
        }, null, 2);
      }
      
      if (format === 'csv') {
        const headers = ['Title', 'Author', 'Status', 'Date Added', 'Date Started', 'Date Finished', 'Personal Rating', 'Pages', 'Categories'];
        const rows = readingList.map(item => [
          item.book.title,
          item.book.author.join('; '),
          item.status,
          item.dateAdded,
          item.dateStarted || '',
          item.dateFinished || '',
          item.personalRating || '',
          item.book.pageCount || '',
          item.book.categories?.join('; ') || '',
        ]);
        
        return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
      }
      
      if (format === 'markdown') {
        let markdown = '# My Reading Library\n\n';
        markdown += `**Export Date:** ${new Date().toLocaleDateString()}\n\n`;
        markdown += `## Statistics\n\n`;
        markdown += `- **Total Books:** ${progress.totalBooks}\n`;
        markdown += `- **Want to Read:** ${progress.wantToRead}\n`;
        markdown += `- **Currently Reading:** ${progress.currentlyReading.length}\n`;
        markdown += `- **Completed:** ${progress.completedBooks.length}\n`;
        markdown += `- **Completed This Year:** ${progress.completedThisYear}\n`;
        markdown += `- **Average Rating:** ${progress.averageRating.toFixed(1)}/5\n`;
        markdown += `- **Total Pages Read:** ${progress.readingStats.totalPages}\n\n`;
        
        // Group by status
        const groupedBooks = {
          'want-to-read': readingList.filter(item => item.status === 'want-to-read'),
          'currently-reading': readingList.filter(item => item.status === 'currently-reading'),
          'read': readingList.filter(item => item.status === 'read'),
        };
        
        for (const [status, books] of Object.entries(groupedBooks)) {
          if (books.length > 0) {
            const statusTitle = status.split('-').map(word => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            
            markdown += `## ${statusTitle} (${books.length})\n\n`;
            
            for (const item of books) {
              markdown += `### ${item.book.title}\n`;
              markdown += `**Author:** ${item.book.author.join(', ')}\n`;
              if (item.book.publishedDate) markdown += `**Published:** ${item.book.publishedDate}\n`;
              if (item.book.pageCount) markdown += `**Pages:** ${item.book.pageCount}\n`;
              if (item.personalRating) markdown += `**My Rating:** ${item.personalRating}/5\n`;
              if (item.dateStarted) markdown += `**Started:** ${item.dateStarted}\n`;
              if (item.dateFinished) markdown += `**Finished:** ${item.dateFinished}\n`;
              if (item.personalNotes) markdown += `**Notes:** ${item.personalNotes}\n`;
              markdown += '\n';
            }
          }
        }
        
        return markdown;
      }
      
      return '';
    } catch (error) {
      throw new Error(`Failed to export reading data: ${error}`);
    }
  }
}