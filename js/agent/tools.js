/**
 * Shared Ollama tool definitions for HELIOS AI core (CLI + FAB tools).
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
      name: 'get_mission_brief_context',
      description:
        'Rich mission context: Need/Capability/Margin, dossier gates, fidelity, GA pack, next actions.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_mission_campaign',
      description:
        'Run a full campaign: set origin/destination, departure year or date, vehicle/cargo/arch, optional launch site, compute route, optional SUGGEST GA / open windows. Prefer for natural-language mission setup.',
      parameters: {
        type: 'object',
        properties: {
          origin: { type: 'string' },
          destination: { type: 'string' },
          departure: { type: 'string', description: 'YYYY-MM-DD or year YYYY' },
          vehicleId: { type: 'string', description: 'sh-starship | falcon9' },
          cargoMass_kg: { type: 'number' },
          starshipArch: { type: 'string', description: 'unrefueled | tanker-n' },
          launchSiteId: { type: 'string', description: 'any | cape | vandenberg | kourou' },
          clearFirst: { type: 'boolean' },
          compute: { type: 'boolean' },
          suggestGa: { type: 'boolean' },
          openWindows: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_gate_recovery',
      description: 'List deterministic recovery options for current NO-GO / fail gates (no side effects).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_gate_recovery',
      description:
        'Apply one recovery: reduce_cargo | tanker_arch | site_any | nearest_window | clear_flybys',
      parameters: {
        type: 'object',
        properties: {
          actionId: { type: 'string' },
        },
        required: ['actionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_nearest_window',
      description: 'Search nearest feasible departure window and recompute.',
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
      name: 'set_launch_site',
      description: 'Set launch site DLA band: any | cape | vandenberg | kourou',
      parameters: {
        type: 'object',
        properties: { launchSiteId: { type: 'string' } },
        required: ['launchSiteId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_ga',
      description: 'Run SUGGEST GA gravity-assist path search (local seeds).',
      parameters: {
        type: 'object',
        properties: { thorough: { type: 'boolean' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_itineraries',
      description:
        'Run intelligent multi-leg itinerary search (named tour templates + local evaluation). Not a global tour optimizer.',
      parameters: {
        type: 'object',
        properties: { thorough: { type: 'boolean' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_itinerary',
      description:
        'Apply a suggestion from the last SUGGEST ITINERARY pack by index (0 = top / recommended).',
      parameters: {
        type: 'object',
        properties: { index: { type: 'number', description: '0-based index into last pack' } },
        required: ['index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_campaign_with_log',
      description:
        'Run multi-step campaign with step log and optional human approve gates (Results AI strip). Prefer when user wants staged campaign + approval.',
      parameters: {
        type: 'object',
        properties: {
          origin: { type: 'string' },
          destination: { type: 'string' },
          departure: { type: 'string' },
          vehicleId: { type: 'string' },
          cargoMass_kg: { type: 'number' },
          starshipArch: { type: 'string' },
          launchSiteId: { type: 'string' },
          clearFirst: { type: 'boolean' },
          compute: { type: 'boolean' },
          suggestGa: { type: 'boolean' },
          autoRecover: { type: 'boolean' },
          requireApproval: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_watchdogs',
      description:
        'Read readiness / path-honesty / fidelity watchdog alerts (always-on agent advice).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_watchdog_action',
      description:
        'Apply a watchdog fix: set_path_geometry | set_ephemeris | enable_horizons | compute | recover',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          value: {},
        },
        required: ['type'],
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

export const AGENT_SYSTEM_WITH_TOOLS = `You are HELIOS AI core — campaign co-pilot with planner tools.

Rules:
- Industrial preliminary workstation only — not flight-certified, not range safety, not operational OD, not SpaceX warranty.
- Prefer run_mission_campaign for multi-step setup (origin, dest, date/year, cargo, vehicle, site, compute).
- Prefer run_campaign_with_log when the user wants step-by-step campaign log / human approval gates.
- Prefer get_mission_brief_context or get_watchdogs before analysis. On NO-GO: propose_gate_recovery then apply_gate_recovery with user intent.
- For multi-stop tours: suggest_itineraries then apply_itinerary (local seeds only — not global tour optimum).
- For assists: suggest_ga (local seeds only — not global tour optimum).
- Numbers come only from tool results / live context — never invent Δv.
- Keep answers concise; label uncertainties.`;

/**
 * Run one agentic chat round-trip with tools via chatFn and executeFn.
 */
export async function runToolAgentLoop({
  messages,
  chatFn,
  executeFn,
  maxRounds = 10,
  onTool,
  tools = HELIOS_AGENT_TOOLS,
}) {
  for (let round = 0; round < maxRounds; round++) {
    const data = await chatFn({
      messages,
      tools,
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
