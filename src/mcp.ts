declare const process: { env?: { MCP_SERVER_URL?: string } } | undefined;

export interface ToolDefinition {
    type: string;
    name: string;
    description?: string;
    parameters?: unknown;
}

const DEFAULT_URL = process?.env?.MCP_SERVER_URL || 'http://localhost:3000';

export async function fetchTools(baseUrl: string = DEFAULT_URL): Promise<ToolDefinition[]> {
    const url = baseUrl || DEFAULT_URL;
    if (!url) {
        throw new Error('MCP server URL is not configured');
    }
    const res = await fetch(`${url}/v1/tool`);
    if (!res.ok) throw new Error(`Failed to fetch tools: ${res.status}`);
    const data: unknown = await res.json();
    if (Array.isArray(data)) return data as ToolDefinition[];
    if (typeof data === 'object' && data !== null) {
        const anyData = data as any;
        if (Array.isArray(anyData.tools)) return anyData.tools as ToolDefinition[];
        if (Array.isArray(anyData.data)) return anyData.data as ToolDefinition[];
    }
    return [];
}

export async function triggerTool(name: string, args: unknown, baseUrl: string = DEFAULT_URL): Promise<unknown> {
    const url = baseUrl || DEFAULT_URL;
    if (!url) {
        throw new Error('MCP server URL is not configured');
    }
    const res = await fetch(`${url}/v1/tool/${encodeURIComponent(name)}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args ?? {}),
    });
    if (!res.ok) throw new Error(`Failed to trigger tool ${name}: ${res.status}`);
    const data: unknown = await res.json();
    if (data && typeof data === 'object') {
        const anyData = data as any;
        if ('result' in anyData) return anyData.result;
        if ('data' in anyData) return anyData.data;
    }
    return data;
}
