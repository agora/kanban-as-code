import { z } from 'zod';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'must be an ISO date',
  });

const ProblemStatementSchema = z.object({
  id: z.string().min(1),
  category: z.enum([
    'architecture',
    'user_friction',
    'business_gap',
    'capability_gap',
    'developer_experience',
    'operational_pain',
    'technical_debt',
    'strategic_opportunity',
    'compliance',
  ]),
  title: z.string().min(1),
  statement: z.string().min(1),
  impact: z.string().min(1),
  evidence: z.array(z.string().min(1)).nonempty(),
  cost_of_delay: z.enum(['low', 'medium', 'high']).optional(),
  exit_condition: z.string().optional(),
});

const GearsRequirementSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(['while', 'when', 'if', 'unless', 'after']),
  precondition: z.string().optional(),
  trigger: z.string().optional(),
  system: z.string().min(1),
  shall: z.string().min(1),
  outcome: z.string().optional(),
  response: z.string().optional(),
  priority: z.enum(['must', 'should', 'may']),
});

const BaseSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  summary_developers: z.string().optional(),
  summary_landing: z.string().optional(),
  owner: z.string().optional(),
  assignee: z.string().optional(),
  reviewer: z.string().optional(),
  tags: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  related: z.array(z.string()).optional(),
  related_docs: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
  created: dateString.optional(),
  lastUpdated: dateString.optional(),
  blocking_reason: z.string().optional(),
  unblock_owner: z.string().optional(),
  moved_to: z.string().optional(),
  merged_into: z.string().optional(),
}).passthrough();

const ThemeSchema = BaseSchema.extend({
  type: z.literal('theme'),
  description: z.string().optional(),
});

const AreaSchema = BaseSchema.extend({
  type: z.literal('area'),
  theme_ids: z.array(z.string()).min(1),
});

const InitiativeSchema = BaseSchema.extend({
  type: z.literal('initiative'),
  status: z.enum([
    'proposed',
    'ready',
    'in-progress',
    'blocked',
    'review',
    'done',
    'deferred',
    'cancelled',
    'archived',
  ]),
  theme_ids: z.array(z.string()).min(1),
  area_id: z.string().min(1),
  lifecycle_stage: z.enum(['planned', 'active', 'maintenance', 'sunset']),
  priority_tier: z.enum(['p0', 'p1', 'p2', 'p3']).optional(),
  initiative_class: z.enum(['capability', 'enabler', 'debt', 'experiment']),
  problem_statements: z.array(ProblemStatementSchema).optional(),
  outcomes: z.array(z.string()).optional(),
  complexity: z
    .object({
      technical: z.number().min(1).max(5),
      scope: z.number().min(1).max(5),
      coordination: z.number().min(1).max(5),
      uncertainty: z.number().min(1).max(5),
      total: z.number().optional(),
      risk_multiplier: z.number().optional(),
    })
    .optional(),
});

const SliceSchema = BaseSchema.extend({
  type: z.literal('slice'),
  status: z.enum([
    'idea',
    'analysis',
    'ready',
    'coding',
    'review',
    'testing',
    'ready-for-release',
    'done',
    'blocked',
    'deferred',
    'cancelled',
    'archived',
  ]),
  initiative_id: z.string().optional(),
  value_stream: z.string().optional(),
  scope: z.string().min(1).optional(),
  wait_state: z.string().optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  gears_requirements: z.array(GearsRequirementSchema).optional(),
  slice_type: z.enum(['feature', 'platform', 'debt', 'experiment']),
});

const TaskSchema = BaseSchema.extend({
  type: z.literal('task'),
  status: z.enum([
    'proposed',
    'ready',
    'in-progress',
    'blocked',
    'review',
    'done',
    'deferred',
    'cancelled',
    'archived',
  ]),
  parent_id: z.string().optional(),
  agent_workspace: z.string().optional(),
});

const StrategyCurrentSchema = BaseSchema.extend({
  type: z.literal('strategy-current'),
  status: z.enum(['active', 'draft', 'archived']),
});

const StrategicExecutionSpecSchema = BaseSchema.extend({
  type: z.literal('strategic-execution-spec'),
  status: z.enum(['active', 'draft', 'archived']),
});

const ArchitectureReferenceSchema = BaseSchema.extend({
  type: z.literal('architecture-reference'),
  status: z.enum(['active', 'draft', 'archived']),
});

const GenericSchema = BaseSchema;

export const SCHEMA_BY_TYPE = {
  theme: ThemeSchema,
  area: AreaSchema,
  initiative: InitiativeSchema,
  slice: SliceSchema,
  task: TaskSchema,
  'architecture-reference': ArchitectureReferenceSchema,
  'strategy-current': StrategyCurrentSchema,
  'strategic-execution-spec': StrategicExecutionSpecSchema,
  generic: GenericSchema,
};

export const WORKFLOW_STATUSES = [
  'proposed',
  'ready',
  'in-progress',
  'blocked',
  'review',
  'done',
  'deferred',
  'cancelled',
  'archived',
];

export const SLICE_STATUS_FLOW = [
  'idea',
  'analysis',
  'ready',
  'coding',
  'review',
  'testing',
  'ready-for-release',
  'done',
  'blocked',
  'deferred',
  'cancelled',
  'archived',
];

export const STRATEGY_STATUS_FLOW = ['draft', 'active', 'archived'];

export const STAGE_ORDER = Array.from(
  new Set([...WORKFLOW_STATUSES, ...SLICE_STATUS_FLOW, ...STRATEGY_STATUS_FLOW]),
);

export const ACTIVE_INITIATIVE_STATUSES = ['ready', 'in-progress', 'blocked', 'review', 'done'];
export const ACTIVE_SLICE_STATUSES = [
  'idea',
  'analysis',
  'ready',
  'coding',
  'review',
  'testing',
  'ready-for-release',
  'done',
];
export const ACTIVE_STRATEGY_STATUSES = ['draft', 'active'];

export function getSchemaForType(type = 'generic') {
  return SCHEMA_BY_TYPE[type] || GenericSchema;
}

function getCollectionTypeMap() {
  return {
    'architecture-reference': 'architecture-reference',
    'strategy-current': 'strategy-current',
    'strategic-execution-spec': 'strategic-execution-spec',
    themes: 'theme',
    areas: 'area',
    initiatives: 'initiative',
    slices: 'slice',
    docs: 'generic',
    archive: 'generic',
  };
}

export function inferTypeFromCollectionName(name) {
  const normalized = String(name || '').toLowerCase();
  const collectionTypeMap = getCollectionTypeMap();
  if (collectionTypeMap[normalized]) {
    return collectionTypeMap[normalized];
  }
  if (normalized.endsWith('s')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}
