export interface MCPRequest {
  method: string;
  params?: any;
  id?: string | number;
}

export interface MCPResponse {
  result?: any;
  error?: MCPError;
  id?: string | number;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCallParams {
  name: string;
  arguments: any;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: MCPCapabilities;
}

export interface MCPCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
  sampling?: boolean;
}

export interface MCPTransportConfig {
  stdio?: boolean;
  http?: {
    port: number;
    host?: string;
  };
  websocket?: {
    port: number;
    host?: string;
  };
}