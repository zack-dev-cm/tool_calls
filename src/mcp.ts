declare const process: { env?: { MCP_SERVER_URL?: string } } | undefined;

export interface ToolDefinition {
    type: string;
    name: string;
    description?: string;
    parameters?: unknown;
}

const DEFAULT_URL = process?.env?.MCP_SERVER_URL ?? '';

export async function fetchTools(baseUrl: string = DEFAULT_URL): Promise<ToolDefinition[]> {
    const res = await fetch(`${baseUrl}/tools`);
    if (!res.ok) throw new Error(`Failed to fetch tools: ${res.status}`);
    return res.json();
}

export async function triggerTool(name: string, args: unknown, baseUrl: string = DEFAULT_URL): Promise<unknown> {
    const res = await fetch(`${baseUrl}/tools/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args ?? {}),
    });
    if (!res.ok) throw new Error(`Failed to trigger tool ${name}: ${res.status}`);
    return res.json();
}
