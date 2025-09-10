import * as fs from 'fs/promises';
import * as path from 'path';

export interface NoteSummary {
  title: string;
  summary: string;
  keyPoints: string[];
  wordCount: number;
  confidence: number;
}

export interface NoteOutline {
  title: string;
  outline: {
    level: number;
    heading: string;
    content?: string;
  }[];
  structure: 'hierarchical' | 'chronological' | 'topical';
}

export interface TagSuggestion {
  tag: string;
  confidence: number;
  reason: string;
  category: 'topic' | 'context' | 'type' | 'status';
}

export interface AnalysisResult {
  content: string;
  analysis: {
    themes: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
    complexity: 'simple' | 'medium' | 'complex';
    readability: number; // 0-100 score
    suggestedTags: TagSuggestion[];
  };
}

export class AIAnalysisPlugin {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  /**
   * Generate a summary of note content
   */
  async summarizeNote(notePath: string, maxLength: number = 200): Promise<NoteSummary | null> {
    try {
      const fullPath = path.resolve(this.vaultPath, notePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      
      const bodyContent = this.extractBodyContent(content);
      const wordCount = this.countWords(bodyContent);
      
      if (wordCount < 50) {
        return {
          title: path.basename(notePath, '.md'),
          summary: 'Note is too short to summarize effectively.',
          keyPoints: [],
          wordCount,
          confidence: 0.3
        };
      }

      // Extract key sentences using simple heuristics
      const sentences = this.extractSentences(bodyContent);
      const keyPoints = this.extractKeyPoints(bodyContent);
      const summary = this.generateSummary(sentences, maxLength);

      return {
        title: path.basename(notePath, '.md'),
        summary,
        keyPoints,
        wordCount,
        confidence: this.calculateSummaryConfidence(bodyContent, summary)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate an outline structure for a note
   */
  async generateNoteOutline(notePath: string): Promise<NoteOutline | null> {
    try {
      const fullPath = path.resolve(this.vaultPath, notePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      
      const bodyContent = this.extractBodyContent(content);
      const existingHeadings = this.extractHeadings(bodyContent);
      
      if (existingHeadings.length > 0) {
        // Note already has structure
        return {
          title: path.basename(notePath, '.md'),
          outline: existingHeadings,
          structure: 'hierarchical'
        };
      }

      // Generate outline based on content analysis
      const paragraphs = bodyContent.split('\n\n').filter(p => p.trim().length > 0);
      const outline = this.generateOutlineFromContent(paragraphs);
      const structure = this.determineStructureType(bodyContent);

      return {
        title: path.basename(notePath, '.md'),
        outline,
        structure
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Suggest tags based on content analysis
   */
  async suggestTags(notePath: string, maxTags: number = 8): Promise<TagSuggestion[]> {
    try {
      const fullPath = path.resolve(this.vaultPath, notePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      
      const bodyContent = this.extractBodyContent(content);
      const existingTags = this.extractExistingTags(content);
      
      const suggestions: TagSuggestion[] = [];
      
      // Analyze content for topic tags
      const topicTags = this.extractTopicTags(bodyContent, existingTags);
      suggestions.push(...topicTags);
      
      // Analyze content for context tags
      const contextTags = this.extractContextTags(bodyContent, existingTags);
      suggestions.push(...contextTags);
      
      // Analyze content for type tags
      const typeTags = this.extractTypeTags(bodyContent, existingTags);
      suggestions.push(...typeTags);
      
      // Analyze content for status tags
      const statusTags = this.extractStatusTags(bodyContent, existingTags);
      suggestions.push(...statusTags);
      
      // Sort by confidence and limit results
      return suggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxTags);
    } catch (error) {
      return [];
    }
  }

  /**
   * Analyze note content and provide comprehensive insights
   */
  async analyzeNote(notePath: string): Promise<AnalysisResult | null> {
    try {
      const fullPath = path.resolve(this.vaultPath, notePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      
      const bodyContent = this.extractBodyContent(content);
      
      const themes = this.extractThemes(bodyContent);
      const sentiment = this.analyzeSentiment(bodyContent);
      const complexity = this.analyzeComplexity(bodyContent);
      const readability = this.calculateReadabilityScore(bodyContent);
      const suggestedTags = await this.suggestTags(notePath, 6);
      
      return {
        content: bodyContent,
        analysis: {
          themes,
          sentiment,
          complexity,
          readability,
          suggestedTags
        }
      };
    } catch (error) {
      return null;
    }
  }

  // Private helper methods

  private extractBodyContent(content: string): string {
    // Remove frontmatter
    const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
    return content.replace(frontmatterRegex, '').trim();
  }

  private countWords(text: string): number {
    if (!text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  }

  private extractSentences(text: string): string[] {
    // Simple sentence extraction
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }

  private extractKeyPoints(text: string): string[] {
    const keyPoints: string[] = [];
    
    // Look for bullet points
    const bulletRegex = /^[\s]*[-*+]\s+(.+)$/gm;
    let match;
    while ((match = bulletRegex.exec(text)) !== null) {
      keyPoints.push(match[1].trim());
    }
    
    // Look for numbered lists
    const numberedRegex = /^[\s]*\d+\.\s+(.+)$/gm;
    while ((match = numberedRegex.exec(text)) !== null) {
      keyPoints.push(match[1].trim());
    }
    
    // If no lists, extract sentences with important keywords
    if (keyPoints.length === 0) {
      const sentences = this.extractSentences(text);
      const importantKeywords = ['important', 'key', 'main', 'primary', 'essential', 'crucial', 'significant'];
      
      keyPoints.push(...sentences.filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        return importantKeywords.some(keyword => lowerSentence.includes(keyword));
      }).slice(0, 5));
    }
    
    return keyPoints.slice(0, 8); // Limit to 8 key points
  }

  private generateSummary(sentences: string[], maxLength: number): string {
    if (sentences.length === 0) return 'No content to summarize.';
    
    // Simple extractive summarization
    // Score sentences by length, position, and keyword frequency
    const scoredSentences = sentences.map((sentence, index) => {
      let score = 0;
      
      // Position score (earlier sentences get higher score)
      score += (sentences.length - index) / sentences.length * 10;
      
      // Length score (prefer medium-length sentences)
      const words = sentence.split(/\s+/).length;
      if (words > 8 && words < 25) score += 15;
      
      // Keyword score
      const importantWords = ['key', 'important', 'main', 'significant', 'because', 'therefore', 'however', 'result'];
      const lowerSentence = sentence.toLowerCase();
      score += importantWords.filter(word => lowerSentence.includes(word)).length * 5;
      
      return { sentence, score, index };
    });
    
    // Select top sentences
    scoredSentences.sort((a, b) => b.score - a.score);
    
    let summary = '';
    let currentLength = 0;
    
    for (const item of scoredSentences) {
      if (currentLength + item.sentence.length > maxLength) break;
      if (summary) summary += ' ';
      summary += item.sentence;
      currentLength += item.sentence.length;
    }
    
    return summary || sentences[0];
  }

  private calculateSummaryConfidence(originalText: string, summary: string): number {
    const originalWords = this.countWords(originalText);
    const summaryWords = this.countWords(summary);
    
    if (originalWords < 50) return 0.3;
    if (summaryWords === 0) return 0;
    
    const compressionRatio = summaryWords / originalWords;
    
    // Optimal compression ratio is between 0.1 and 0.3
    if (compressionRatio >= 0.1 && compressionRatio <= 0.3) return 0.9;
    if (compressionRatio >= 0.05 && compressionRatio <= 0.5) return 0.7;
    return 0.5;
  }

  private extractHeadings(content: string): { level: number; heading: string; content?: string }[] {
    const headings: { level: number; heading: string; content?: string }[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        headings.push({
          level: headingMatch[1].length,
          heading: headingMatch[2].trim()
        });
      }
    }
    
    return headings;
  }

  private generateOutlineFromContent(paragraphs: string[]): { level: number; heading: string; content?: string }[] {
    const outline: { level: number; heading: string; content?: string }[] = [];
    
    if (paragraphs.length === 0) return outline;
    
    // Generate main sections based on content analysis
    const themes = this.identifyContentThemes(paragraphs);
    
    themes.forEach((theme, index) => {
      outline.push({
        level: 1,
        heading: theme.title,
        content: theme.summary
      });
      
      // Add subsections if content is long enough
      if (theme.paragraphs.length > 2) {
        const subThemes = this.identifySubThemes(theme.paragraphs);
        subThemes.forEach(subTheme => {
          outline.push({
            level: 2,
            heading: subTheme,
          });
        });
      }
    });
    
    return outline;
  }

  private identifyContentThemes(paragraphs: string[]): Array<{ title: string; summary: string; paragraphs: string[] }> {
    // Simple theme identification based on keyword clustering
    const themes: Array<{ title: string; summary: string; paragraphs: string[] }> = [];
    
    if (paragraphs.length <= 3) {
      return [{
        title: 'Main Content',
        summary: paragraphs[0].substring(0, 100) + '...',
        paragraphs
      }];
    }
    
    // For longer content, try to identify themes
    const midPoint = Math.floor(paragraphs.length / 2);
    
    themes.push({
      title: 'Introduction',
      summary: paragraphs[0].substring(0, 80) + '...',
      paragraphs: paragraphs.slice(0, midPoint)
    });
    
    themes.push({
      title: 'Details',
      summary: paragraphs[midPoint].substring(0, 80) + '...',
      paragraphs: paragraphs.slice(midPoint)
    });
    
    return themes;
  }

  private identifySubThemes(paragraphs: string[]): string[] {
    // Extract potential subheadings from paragraph starts
    return paragraphs.slice(0, 3).map((p, index) => {
      const firstSentence = p.split('.')[0];
      if (firstSentence.length > 50) {
        return `Point ${index + 1}`;
      }
      return firstSentence.length > 5 ? firstSentence : `Section ${index + 1}`;
    });
  }

  private determineStructureType(content: string): 'hierarchical' | 'chronological' | 'topical' {
    // Simple heuristics to determine structure
    const timeWords = ['first', 'then', 'next', 'finally', 'before', 'after', 'during'];
    const hierarchyWords = ['furthermore', 'moreover', 'additionally', 'however', 'therefore'];
    
    const lowerContent = content.toLowerCase();
    const timeScore = timeWords.filter(word => lowerContent.includes(word)).length;
    const hierarchyScore = hierarchyWords.filter(word => lowerContent.includes(word)).length;
    
    if (timeScore > hierarchyScore) return 'chronological';
    if (hierarchyScore > 0) return 'hierarchical';
    return 'topical';
  }

  private extractExistingTags(content: string): string[] {
    const tags: string[] = [];
    
    // Extract from frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const yamlContent = frontmatterMatch[1];
      const tagMatch = yamlContent.match(/tags:\s*\[(.*?)\]/);
      if (tagMatch) {
        tags.push(...tagMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '')));
      }
    }
    
    // Extract inline tags
    const inlineTagMatches = content.match(/#[\w-]+/g);
    if (inlineTagMatches) {
      tags.push(...inlineTagMatches.map(tag => tag.substring(1)));
    }
    
    return [...new Set(tags)];
  }

  private extractTopicTags(content: string, existingTags: string[]): TagSuggestion[] {
    const suggestions: TagSuggestion[] = [];
    const lowerContent = content.toLowerCase();
    
    const topicKeywords = {
      'meeting': ['meeting', 'agenda', 'attendees', 'action items'],
      'research': ['study', 'analysis', 'findings', 'methodology'],
      'project': ['project', 'timeline', 'deliverable', 'milestone'],
      'learning': ['learn', 'understand', 'concept', 'theory'],
      'planning': ['plan', 'strategy', 'goal', 'objective'],
      'review': ['review', 'retrospective', 'feedback', 'evaluation']
    };
    
    for (const [tag, keywords] of Object.entries(topicKeywords)) {
      if (existingTags.includes(tag)) continue;
      
      const matches = keywords.filter(keyword => lowerContent.includes(keyword)).length;
      if (matches > 0) {
        suggestions.push({
          tag,
          confidence: Math.min(0.9, matches / keywords.length + 0.3),
          reason: `Found ${matches} related keywords: ${keywords.filter(k => lowerContent.includes(k)).join(', ')}`,
          category: 'topic'
        });
      }
    }
    
    return suggestions;
  }

  private extractContextTags(content: string, existingTags: string[]): TagSuggestion[] {
    const suggestions: TagSuggestion[] = [];
    const lowerContent = content.toLowerCase();
    
    const contextKeywords = {
      'work': ['office', 'colleague', 'business', 'professional'],
      'personal': ['family', 'friend', 'hobby', 'personal'],
      'academic': ['university', 'professor', 'student', 'academic'],
      'technical': ['code', 'programming', 'software', 'technical']
    };
    
    for (const [tag, keywords] of Object.entries(contextKeywords)) {
      if (existingTags.includes(tag)) continue;
      
      const matches = keywords.filter(keyword => lowerContent.includes(keyword)).length;
      if (matches > 0) {
        suggestions.push({
          tag,
          confidence: Math.min(0.8, matches / keywords.length + 0.2),
          reason: `Context indicators: ${keywords.filter(k => lowerContent.includes(k)).join(', ')}`,
          category: 'context'
        });
      }
    }
    
    return suggestions;
  }

  private extractTypeTags(content: string, existingTags: string[]): TagSuggestion[] {
    const suggestions: TagSuggestion[] = [];
    
    const typeIndicators = {
      'note': content.includes('note') || content.includes('記録'),
      'idea': content.includes('idea') || content.includes('アイデア'),
      'todo': content.includes('- [ ]') || content.includes('todo'),
      'summary': content.includes('summary') || content.includes('要約'),
      'reference': content.includes('reference') || content.includes('参考')
    };
    
    for (const [tag, hasIndicator] of Object.entries(typeIndicators)) {
      if (existingTags.includes(tag) || !hasIndicator) continue;
      
      suggestions.push({
        tag,
        confidence: 0.7,
        reason: `Document type indicator found`,
        category: 'type'
      });
    }
    
    return suggestions;
  }

  private extractStatusTags(content: string, existingTags: string[]): TagSuggestion[] {
    const suggestions: TagSuggestion[] = [];
    const lowerContent = content.toLowerCase();
    
    const statusIndicators = {
      'draft': ['draft', 'wip', 'work in progress'],
      'completed': ['completed', 'finished', 'done'],
      'urgent': ['urgent', 'asap', 'priority'],
      'archived': ['archived', 'old', 'deprecated']
    };
    
    for (const [tag, indicators] of Object.entries(statusIndicators)) {
      if (existingTags.includes(tag)) continue;
      
      const hasIndicator = indicators.some(indicator => lowerContent.includes(indicator));
      if (hasIndicator) {
        suggestions.push({
          tag,
          confidence: 0.6,
          reason: `Status indicator found: ${indicators.find(i => lowerContent.includes(i))}`,
          category: 'status'
        });
      }
    }
    
    return suggestions;
  }

  private extractThemes(content: string): string[] {
    const themes: string[] = [];
    const lowerContent = content.toLowerCase();
    
    // Extract potential themes from frequent nouns and concepts
    const words = lowerContent.match(/\b[a-z]{4,}\b/g) || [];
    const wordFreq = new Map<string, number>();
    
    words.forEach(word => {
      if (this.isStopWord(word)) return;
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });
    
    // Get most frequent meaningful words as themes
    const sortedWords = Array.from(wordFreq.entries())
      .filter(([word, freq]) => freq >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
    
    themes.push(...sortedWords);
    
    return themes;
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set(['that', 'this', 'with', 'have', 'will', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were']);
    return stopWords.has(word);
  }

  private analyzeSentiment(content: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'like', 'enjoy', 'happy', 'successful', 'achievement'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'sad', 'angry', 'frustrated', 'problem', 'issue', 'difficult', 'challenging'];
    
    const lowerContent = content.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerContent.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerContent.includes(word)).length;
    
    if (positiveCount > negativeCount + 1) return 'positive';
    if (negativeCount > positiveCount + 1) return 'negative';
    return 'neutral';
  }

  private analyzeComplexity(content: string): 'simple' | 'medium' | 'complex' {
    const sentences = this.extractSentences(content);
    if (sentences.length === 0) return 'simple';
    
    const avgWordsPerSentence = this.countWords(content) / sentences.length;
    const complexWords = content.match(/\b[a-z]{8,}\b/gi)?.length || 0;
    const totalWords = this.countWords(content);
    const complexWordRatio = totalWords > 0 ? complexWords / totalWords : 0;
    
    if (avgWordsPerSentence > 20 || complexWordRatio > 0.2) return 'complex';
    if (avgWordsPerSentence > 15 || complexWordRatio > 0.1) return 'medium';
    return 'simple';
  }

  private calculateReadabilityScore(content: string): number {
    const sentences = this.extractSentences(content);
    const words = this.countWords(content);
    const syllables = this.countSyllables(content);
    
    if (sentences.length === 0 || words === 0) return 50;
    
    // Simplified Flesch Reading Ease formula
    const avgWordsPerSentence = words / sentences.length;
    const avgSyllablesPerWord = syllables / words;
    
    const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    
    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private countSyllables(text: string): number {
    // Simple syllable counting heuristic
    const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
    let syllableCount = 0;
    
    for (const word of words) {
      const vowels = word.match(/[aeiou]/g);
      if (vowels) {
        syllableCount += vowels.length;
        // Subtract silent 'e' at end
        if (word.endsWith('e')) syllableCount--;
      }
      // Every word has at least 1 syllable
      if (syllableCount === 0) syllableCount = 1;
    }
    
    return syllableCount;
  }
}