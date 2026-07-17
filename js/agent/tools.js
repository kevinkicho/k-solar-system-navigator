/**
 * Shared Ollama tool definitions for HELIOS agent (CLI + optional FAB tools).
 * Canonical names only — aliases live server-side / executor.
 */

export const HELIOS_AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_mission_state',
      description: 'Read current HELIOS planner state (origin, destination, vehicle, transfer).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_route',
      description: 'Set origin and/or destination body by name (e.g. Earth, Mars).',
      parameters: {
        type: 'object',
        properties: {
          origin: { type: 'string' },
          destination: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compute_route',
      description: 'Compute Lambert / multi-leg transfer for the current route.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_route',
      description: 'Clear the current route.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_vehicle',
      description: 'Set vehicle / cargo / Starship architecture.',
      parameters: {
        type: 'object',
        properties: {
          vehicleId: { type: 'string' },
          cargoMass_kg: { type: 'number' },
          starshipArch: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_departure',
      description: 'Set departure date (YYYY-MM-DD or ISO).',
      parameters: {
        type: 'object',
        properties: { date: { type: 'string' } },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_bodies',
      description: 'List available body names for routing.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notify',
      description: 'Show a toast in the HELIOS UI.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    },
  },
];

export const AGENT_SYSTEM_WITH_TOOLS = `You are HELIOS Assistant with optional planner tools.

Rules:
- Concept-grade educational planner only — not flight ops.
- Prefer get_mission_state before major changes.
- For route requests: set_route → set_departure (if given) → set_vehicle (if given) → compute_route → report state.
- Keep answers concise; label uncertainties.
- If a tool fails, explain and stop or retry once.`;

/**
 * Run one agentic chat round-trip with tools via chatFn and executeFn.
 * @param {object} opts
 * @param {Array} opts.messages conversation so far (will be mutated with tool rounds)
 * @param {(body: object) => Promise<object>} opts.chatFn posts to /api/chat, returns Ollama JSON
 * @param {(name: string, args: object) => Promise<any>} opts.executeFn runs a tool
 * @param {number} [opts.maxRounds=6]
 * @returns {Promise<string>} final assistant text
 */
export async function runToolAgentLoop({
  messages,
  chatFn,
  executeFn,
  maxRounds = 6,
  onTool,
}) {
  for (let round = 0; round < maxRounds; round++) {
    const data = await chatFn({
      messages,
      tools: HELIOS_AGENT_TOOLS,
      stream: false,
    });
    const msg = data.message || {};
    const toolCalls = msg.tool_calls || [];

    if (toolCalls.length) {
      messages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        const fn = tc.function || tc;
        const name = fn.name;
        let args = fn.arguments ?? {};
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            args = {};
          }
        }
        if (onTool) onTool(name, args);
        let result;
        try {
          result = await executeFn(name, args);
        } catch (e) {
          result = { error: e.message || String(e) };
        }
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    return msg.content || '(no content)';
  }
  return 'Agent stopped: max tool rounds reached.';
}
