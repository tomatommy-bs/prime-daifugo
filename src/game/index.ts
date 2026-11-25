/** Rules engine public surface (spec §7). */
// biome-ignore lint/performance/noBarrelFile: the engine's single public entry point (plan T1)
// biome-ignore lint/performance/noReExportAll: re-exports the whole engine surface
export * from './cards'
// biome-ignore lint/performance/noReExportAll: re-exports the whole engine surface
export * from './engine'
// biome-ignore lint/performance/noReExportAll: re-exports the whole engine surface
export * from './factor'
// biome-ignore lint/performance/noReExportAll: re-exports the whole engine surface
export * from './numbers'
export type * from './types'
