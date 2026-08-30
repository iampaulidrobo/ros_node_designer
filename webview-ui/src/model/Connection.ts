/**
 * A directed link between two graph entities. The direction is the drag
 * direction of the connection gesture (not necessarily publisher -> subscriber
 * -- see Graph.validateConnection for how publisher/subscriber is inferred).
 */
export interface Connection {
  fromId: string;
  toId: string;
}

/** On-disk JSON shape for a Connection: {"from": ..., "to": ...}. */
export interface ConnectionJSON {
  from: string;
  to: string;
}

export function connectionToDict(c: Connection): ConnectionJSON {
  return { from: c.fromId, to: c.toId };
}

export function connectionFromDict(data: ConnectionJSON): Connection {
  return { fromId: String(data.from), toId: String(data.to) };
}

export function connectionsEqual(a: Connection, b: Connection): boolean {
  return a.fromId === b.fromId && a.toId === b.toId;
}
