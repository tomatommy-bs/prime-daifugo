/**
 * Characterization tests: wire payloads sent by every ClientMessenger method.
 */
import type PartySocket from 'partysocket'
import { describe, expect, it, vi } from 'vitest'
import { ClientMessenger } from './client-messenger'

const makeWs = () => {
  const send = vi.fn<(data: string) => void>()
  return { ws: { send } as unknown as PartySocket, send }
}

const sentBy = (fn: (ws: PartySocket) => void) => {
  const { ws, send } = makeWs()
  fn(ws)
  expect(send).toHaveBeenCalledTimes(1)
  return send.mock.calls[0][0]
}

const rule = { initNumCards: 8, maxSubmitNumCards: 4, timeLimit: 15, halfEvenNumbers: true }

describe('ClientMessenger payloads', () => {
  it('sendMessage', () => {
    expect(
      sentBy((ws) => ClientMessenger.sendMessage({ ws, message: 'hi' })),
    ).toMatchInlineSnapshot(`"{"event":"chat","message":"hi"}"`)
  })

  it('setReady', () => {
    expect(sentBy((ws) => ClientMessenger.setReady({ ws }))).toMatchInlineSnapshot(
      `"{"event":"room","action":"set-ready"}"`,
    )
  })

  it('unsetReady', () => {
    expect(sentBy((ws) => ClientMessenger.unsetReady({ ws }))).toMatchInlineSnapshot(
      `"{"event":"room","action":"unset-ready"}"`,
    )
  })

  it('changeRule', () => {
    expect(
      sentBy((ws) => ClientMessenger.changeRule({ ws, rule: { timeLimit: 300 } })),
    ).toMatchInlineSnapshot(`"{"event":"room","action":"change-rule","rule":{"timeLimit":300}}"`)
  })

  it('startGame with a rule', () => {
    expect(sentBy((ws) => ClientMessenger.startGame({ ws, rule }))).toMatchInlineSnapshot(
      `"{"event":"room","action":"start-game","rule":{"initNumCards":8,"maxSubmitNumCards":4,"timeLimit":15,"halfEvenNumbers":true}}"`,
    )
  })

  it('startGame without a rule omits the key', () => {
    expect(sentBy((ws) => ClientMessenger.startGame({ ws }))).toMatchInlineSnapshot(
      `"{"event":"room","action":"start-game"}"`,
    )
  })

  it('sendName', () => {
    expect(sentBy((ws) => ClientMessenger.sendName({ ws, name: 'alice' }))).toMatchInlineSnapshot(
      `"{"event":"set-name","name":"alice"}"`,
    )
  })

  it('draw', () => {
    expect(sentBy((ws) => ClientMessenger.draw({ ws }))).toMatchInlineSnapshot(
      `"{"event":"game","action":"draw"}"`,
    )
  })

  it('pass', () => {
    expect(sentBy((ws) => ClientMessenger.pass({ ws }))).toMatchInlineSnapshot(
      `"{"event":"game","action":"pass"}"`,
    )
  })

  it('submit', () => {
    expect(
      sentBy((ws) =>
        ClientMessenger.submit({
          ws,
          submitCardSet: { submit: ['JS', '2H'], factor: ['2H', '*', 'JS'] },
        }),
      ),
    ).toMatchInlineSnapshot(
      `"{"event":"game","action":"submit","submitCardSet":{"submit":["JS","2H"],"factor":["2H","*","JS"]}}"`,
    )
  })
})
