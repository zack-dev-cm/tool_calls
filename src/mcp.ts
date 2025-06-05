declare const process: { env?: { MCP_SERVER_URL?: string } } | undefined;

export interface ToolDefinition {
    type: string;
    name: string;
    description?: string;
    parameters?: unknown;
}

const DEFAULT_URL = process?.env?.MCP_SERVER_URL ?? '';

export async function fetchTools(baseUrl: string = DEFAULT_URL): Promise<ToolDefinition[]> {
    const res = await fetch(`${baseUrl}/v1/tool`);
    if (!res.ok) throw new Error(`Failed to fetch tools: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) return data as ToolDefinition[];
    if (Array.isArray(data.tools)) return data.tools as ToolDefinition[];
    if (Array.isArray(data.data)) return data.data as ToolDefinition[];
    return [];
}

export async function triggerTool(name: string, args: unknown, baseUrl: string = DEFAULT_URL): Promise<unknown> {
    const res = await fetch(`${baseUrl}/v1/tool/${encodeURIComponent(name)}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args ?? {}),
    });
    if (!res.ok) throw new Error(`Failed to trigger tool ${name}: ${res.status}`);
    const data = await res.json();
    if (data && typeof data === 'object') {
        if ('result' in data) return (data as any).result;
        if ('data' in data) return (data as any).data;
    }
    return data;
}
