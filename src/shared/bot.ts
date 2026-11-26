/**
 * Bot seats (shared by the protocol, the session reducer and the UI).
 * Runtime code here must stay portable (spec §15).
 */

export const BOT_LEVELS = ['weak', 'normal', 'strong'] as const
export type BotLevel = (typeof BOT_LEVELS)[number]

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = {
  weak: 'よわい',
  normal: 'ふつう',
  strong: 'つよい',
}

/** Bot pids are short and never collide with human pids (16 base64url chars). */
export const BOT_PID_PREFIX = 'bot-'

export const isBotPid = (pid: string): boolean => pid.startsWith(BOT_PID_PREFIX)

/** Display name of the `n`-th bot seat: `CPU1（ふつう）`. */
export const botName = (n: number, level: BotLevel): string =>
  `CPU${n}（${BOT_LEVEL_LABEL[level]}）`
