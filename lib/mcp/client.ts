declare module '@modelcontextprotocol/sdk/client/index.js';
declare module '@modelcontextprotocol/sdk/client/stdio.js';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
}

export class MCPClient {
  private clients: Map<string, Client> = new Map();
  private servers: MCPServer[] = [];

  async connect(server: MCPServer): Promise<boolean> {
    try {
      const transport = new StdioClientTransport({
        command: server.url,
        args: []
      });

      const client = new Client(
        {
          name: 'amy-brain-map',
          version: '1.0.0'
        },
        {
          capabilities: {}
        }
      );

      await client.connect(transport);
      this.clients.set(server.id, client);
      this.servers.push(server);

      return true;
    } catch (error) {
      console.error(`Failed to connect to MCP server ${server.name}:`, error);
      return false;
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.close();
      this.clients.delete(serverId);
    }

    this.servers = this.servers.filter(s => s.id !== serverId);
  }

  async callTool(serverId: string, toolName: string, args: any): Promise<any> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No client connected for server ${serverId}`);
    }

    try {
      const result = await (client as unknown as { callTool: (opts: { name: string; arguments: unknown }) => unknown }).callTool({
        name: toolName,
        arguments: args
      });

      return result;
    } catch (error) {
      console.error(`Failed to call tool ${toolName} on server ${serverId}:`, error);
      throw error;
    }
  }

  getServers(): MCPServer[] {
    return [...this.servers];
  }

  isConnected(serverId: string): boolean {
    return this.clients.has(serverId);
  }
}

// 싱글톤 인스턴스
export const mcpClient = new MCPClient();