import { z } from "zod";

const reference = z.string().min(1);
const positiveCount = z.number().int().positive().max(10_000);
export const QuerySortSchema = z.object({ entityId: reference, direction: z.enum(["ASC", "DESC"]) }).strict();
export const TimeGrainSchema = z.enum(["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]);
export const QueryFilterSchema = z.object({ propertyId: reference, operator: z.enum(["EQ", "NE", "GT", "GTE", "LT", "LTE", "IN", "CONTAINS", "PREFIX", "IS_NULL", "NOT_NULL"]), value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional() }).strict();
export const AggregateFilterSchema = z.object({ entityId: reference, operator: z.enum(["EQ", "NE", "GT", "GTE", "LT", "LTE"]), value: z.number() }).strict();
type Expression<T> = { type: "CONDITION"; filter: T } | { type: "GROUP"; operator: "AND" | "OR"; children: Expression<T>[] } | { type: "NOT"; child: Expression<T> };
export type QueryFilterExpression = Expression<z.infer<typeof QueryFilterSchema>>;
export type AggregateFilterExpression = Expression<z.infer<typeof AggregateFilterSchema>>;
export const QueryFilterExpressionSchema: z.ZodType<QueryFilterExpression> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("CONDITION"), filter: QueryFilterSchema }).strict(),
  z.object({ type: z.literal("GROUP"), operator: z.enum(["AND", "OR"]), children: z.array(QueryFilterExpressionSchema).min(1) }).strict(),
  z.object({ type: z.literal("NOT"), child: QueryFilterExpressionSchema }).strict(),
]));
export const DirectIrFilterSchema = QueryFilterSchema.extend({ kind: z.literal("DIRECT").optional(), businessValue: z.string().optional() });
export type IrFilterExpression = Expression<z.infer<typeof DirectIrFilterSchema>>;
export const IrFilterExpressionSchema: z.ZodType<IrFilterExpression> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("CONDITION"), filter: DirectIrFilterSchema }).strict(),
  z.object({ type: z.literal("GROUP"), operator: z.enum(["AND", "OR"]), children: z.array(IrFilterExpressionSchema).min(1) }).strict(),
  z.object({ type: z.literal("NOT"), child: IrFilterExpressionSchema }).strict(),
]));
export const AggregateFilterExpressionSchema: z.ZodType<AggregateFilterExpression> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("CONDITION"), filter: AggregateFilterSchema }).strict(),
  z.object({ type: z.literal("GROUP"), operator: z.enum(["AND", "OR"]), children: z.array(AggregateFilterExpressionSchema).min(1) }).strict(),
  z.object({ type: z.literal("NOT"), child: AggregateFilterExpressionSchema }).strict(),
]));
export const HierarchyFilterSchema = z.object({ hierarchyId: reference, anchorValue: z.string().min(1), direction: z.enum(["DESCENDANTS", "ANCESTORS"]), includeSelf: z.boolean().optional() }).strict();
export const TimeRangeInputSchema = z.object({
  expression: z.string(), propertyId: reference.optional(),
  kind: z.enum(["NONE", "TODAY", "YESTERDAY", "CURRENT_WEEK", "PREVIOUS_WEEK", "CURRENT_MONTH", "PREVIOUS_MONTH", "CURRENT_QUARTER", "PREVIOUS_QUARTER", "CURRENT_YEAR", "PREVIOUS_YEAR", "ABSOLUTE_YEAR", "ABSOLUTE_MONTH", "CONTEXT_MONTH", "ROLLING_PERIODS", "LAST_N_COMPLETE_PERIODS", "ABSOLUTE_RANGE"]).optional(),
  mode: z.enum(["AUTO", "ROLLING", "LAST_N_COMPLETE_PERIODS"]).optional(), count: positiveCount.optional(), unit: TimeGrainSchema.optional(), year: z.number().int().min(1).max(9999).optional(), month: z.number().int().min(1).max(12).optional(), start: z.string().optional(), endExclusive: z.string().optional(),
}).strict();
export const DerivedMeasureSchema = z.object({ id: reference, label: z.string().min(1), operator: z.enum(["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "RATIO"]), leftMeasureId: reference, rightMeasureId: reference, scale: z.number().optional() }).strict();
export const TimeComparisonSchema = z.object({ id: reference, label: z.string().min(1), measureId: reference, comparison: z.enum(["PREVIOUS_PERIOD", "YEAR_OVER_YEAR"]), output: z.enum(["PREVIOUS_VALUE", "DIFFERENCE", "GROWTH_RATE"]) }).strict();
export const WindowCalculationSchema = z.object({
  id: reference, label: z.string().min(1), measureId: reference,
  operator: z.enum(["RANK", "DENSE_RANK", "RUNNING_SUM", "MOVING_AVG", "PERCENT_OF_TOTAL", "PERCENT_OF_PARTITION"]),
  partitionByPropertyIds: z.array(reference), orderBy: QuerySortSchema.optional(), windowSize: positiveCount.optional(), scale: z.number().optional(), precision: z.number().int().min(0).max(12).optional(), denominatorScope: z.literal("AFTER_BUSINESS_FILTERS_BEFORE_TOP_N").optional(),
}).strict();
export const GroupSelectionSchema = z.object({ id: reference, label: z.string().min(1), operator: z.enum(["TOP_N", "BOTTOM_N"]), partitionByPropertyIds: z.array(reference), orderByEntityId: reference, count: positiveCount, ties: z.enum(["INCLUDE", "EXCLUDE"]) }).strict();
export const PeriodConditionSchema = z.object({ id: reference, label: z.string().min(1), measureId: reference, operator: AggregateFilterSchema.shape.operator, value: z.number(), quantifier: z.enum(["EVERY", "ANY", "AT_LEAST_N"]), minimumMatches: positiveCount.optional(), groupByPropertyIds: z.array(reference), expectedPeriodCount: positiveCount.optional(), missingPeriodPolicy: z.enum(["FAIL", "IGNORE"]) }).strict();
export const AdvancedQueryFields = {
  hierarchyFilters: z.array(HierarchyFilterSchema).optional(), filterExpression: QueryFilterExpressionSchema.optional(),
  aggregateFilters: z.array(AggregateFilterSchema).optional(), aggregateFilterExpression: AggregateFilterExpressionSchema.optional(),
  timeRange: TimeRangeInputSchema.optional(), timeGrain: z.object({ unit: TimeGrainSchema, propertyId: reference.optional() }).strict().optional(),
  derivedMeasures: z.array(DerivedMeasureSchema).optional(), timeComparisons: z.array(TimeComparisonSchema).optional(), windowCalculations: z.array(WindowCalculationSchema).optional(), groupSelections: z.array(GroupSelectionSchema).optional(), periodConditions: z.array(PeriodConditionSchema).optional(),
};
export const FixedQueryShapeSchema = z.object({
  rootObjectId: reference, measureIds: z.array(reference).default([]), dimensionPropertyIds: z.array(reference).default([]),
  selectPropertyIds: z.array(reference).min(1).optional(), includeObjectIds: z.array(reference).optional(), allowFanout: z.boolean().optional(), relationPaths: z.record(reference, z.array(reference).min(1)).optional(), filters: z.array(QueryFilterSchema).default([]), sort: z.array(QuerySortSchema).default([]), limit: positiveCount.default(200), resultKind: z.enum(["aggregate", "detail"]).optional(), ...AdvancedQueryFields,
}).strict();
