/** Legacy resource IDs accept any hex 8-4-4-4-12 grouping, regardless of UUID version/variant. */
export const resourceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
