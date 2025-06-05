import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTools, triggerTool } from '../src/mcp';

const BASE = 'http://mcp';

describe('mcp helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchTools parses tool list', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tools: [{ type: 'function', name: 'hand' }] }),
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', mockFetch);

    const tools = await fetchTools(BASE);

    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/v1/tool`);
    expect(tools).toEqual([{ type: 'function', name: 'hand' }]);
  });

  it('triggerTool posts to invoke endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { success: true } }),
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', mockFetch);

    const result = await triggerTool('hand', { move: 'up' }, BASE);

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/v1/tool/hand/invoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ move: 'up' }),
      },
    );
    expect(result).toEqual({ success: true });
  });
});
