import * as Party from 'partykit/server'

export default class Server implements Party.Server {
  constructor(readonly party: Party.Party) {}

  onRequest(req: Party.Request) {
    return Response.json('Hello, World!')
  }
}

Server satisfies Party.Worker
