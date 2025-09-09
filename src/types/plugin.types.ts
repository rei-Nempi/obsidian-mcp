export interface IPlugin {
  name: string;
  version: string;
  initialize(config: PluginConfig): Promise<void>;
  execute(action: string, params: any): Promise<any>;
  isAvailable(): boolean;
  destroy?(): Promise<void>;
}

export interface PluginConfig {
  enabled: boolean;
  [key: string]: any;
}

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  repository?: string;
  dependencies?: Record<string, string>;
}

export interface PluginRegistry {
  register(plugin: IPlugin): void;
  unregister(name: string): void;
  get(name: string): IPlugin | undefined;
  list(): IPlugin[];
  isRegistered(name: string): boolean;
}

export interface TemplaterConfig extends PluginConfig {
  templatesFolder: string;
  syntaxTrigger?: string;
  enableSystemCommands?: boolean;
}

export interface BookSearchConfig extends PluginConfig {
  defaultTemplate: string;
  providers: string[];
  apiKeys?: Record<string, string>;
}

export interface PluginAction {
  name: string;
  description: string;
  params: PluginActionParam[];
  returns: PluginActionReturn;
}

export interface PluginActionParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: any;
}

export interface PluginActionReturn {
  type: string;
  description?: string;
}