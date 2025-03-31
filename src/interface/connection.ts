export interface Connection {
  id: string
  name: string
  status: 'ready' | 'not-ready'
}

export interface ConnectionState {
  status: 'ready' | 'not-ready'
  name: string
}
