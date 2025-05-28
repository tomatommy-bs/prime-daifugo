export const CONFIG = {
  SINGLETON_LOBBY_ROOM_ID: 'lobby',
} as const

export const WORLD_CONFIG = {
  GROTHENDIECK_PRIME: 57,
} as const

export const GAME_CONFIG = {
  initialNumCards: 11,
  maxSubmitNumCards: 4,
  /** seconds */
  timeLimit: 60,
  halfEvenNumbers: false,
} as const
