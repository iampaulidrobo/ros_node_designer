import { NodeType } from "./NodeType";
import { RosNode, RosNodeJSON, rosNodeToDict, rosNodeFromDict } from "./RosNode";
import { Connection, ConnectionJSON, connectionToDict, connectionFromDict } from "./Connection";

/** Thrown by Graph.addConnection when a proposed connection violates the design rules. */
export class ConnectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionValidationError";
  }
}

export interface ValidationResult {
  ok: boolean;
  message: string;
}

export interface GraphJSON {
  nodes: RosNodeJSON[];
  connections: ConnectionJSON[];
}

const ALLOWED_PAIRS = new Set<string>([
  "node:topic",
  "topic:node",
  "node:service",
  "service:node",
  "node:action",
  "action:node",
]);

/**
 * Human-readable "only one owner" rule for a topic/service/action, used when a
 * second node tries to connect as its owner (see validateConnection).
 */
function ownerRuleMessage(entityType: NodeType): string {
  switch (entityType) {
    case "topic":
      return "A topic can only have one publisher node.";
    case "service":
      return "A service can only have one server node.";
    case "action":
      return "An action can only have one server node.";
    default:
      return "This entity can only have one owning node.";
  }
}

/** The design graph: the single source of truth for a project. Holds all nodes and
 * connections, enforces the connection rules, and provides JSON serialization for
 * Save/Open. Contains no UI code. */
export class Graph {
  private _nodes: Map<string, RosNode> = new Map();
  private _connections: Connection[] = [];
  private _idCounter = 1;

  get nodes(): RosNode[] {
    return Array.from(this._nodes.values());
  }

  get connections(): Connection[] {
    return [...this._connections];
  }

  /** Return a fresh unique node id as a string, skipping any id already in use. */
  nextId(): string {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidate = String(this._idCounter++);
      if (!this._nodes.has(candidate)) {
        return candidate;
      }
    }
  }

  getNode(id: string): RosNode | undefined {
    return this._nodes.get(id);
  }

  /** Add a pre-built node to the graph. */
  addNode(node: RosNode): RosNode {
    if (this._nodes.has(node.id)) {
      throw new Error(`Node id '${node.id}' already exists`);
    }
    this._nodes.set(node.id, node);
    return node;
  }

  /** Create, register and return a new node with an auto-assigned id. */
  createNode(
    type: NodeType,
    nodeName: string,
    topic: string,
    messageType: string,
    x = 0,
    y = 0
  ): RosNode {
    const node: RosNode = {
      id: this.nextId(),
      type,
      nodeName,
      topic,
      messageType,
      x,
      y,
    };
    return this.addNode(node);
  }

  /** Remove a node and any connections referencing it. */
  removeNode(nodeId: string): void {
    this._nodes.delete(nodeId);
    this._connections = this._connections.filter(
      (c) => c.fromId !== nodeId && c.toId !== nodeId
    );
  }

  validateConnection(fromId: string, toId: string): ValidationResult {
    const src = this.getNode(fromId);
    const dst = this.getNode(toId);

    if (!src || !dst) {
      return { ok: false, message: "Both endpoints must be valid nodes." };
    }
    if (fromId === toId) {
      return { ok: false, message: "A node cannot connect to itself." };
    }
    if (!ALLOWED_PAIRS.has(`${src.type}:${dst.type}`)) {
      return {
        ok: false,
        message: "Connections are only allowed between a node and a topic, service, or action.",
      };
    }

    if (this._connections.some((c) => c.fromId === fromId && c.toId === toId)) {
      return { ok: false, message: "That connection already exists." };
    }

    // A node -> entity connection means the node owns/serves that topic, service
    // or action (mirrors "publisher"). Only one node may own a given entity, per
    // ROS semantics (one publisher per topic, one server per service/action) --
    // any number of other nodes may still consume it (subscribe / call / send
    // goals), and a single node may own or consume any number of different
    // topics, services and actions -- there is no requirement that a node's
    // interfaces share a message type, since a node is not itself typed.
    if (src.type === "node" && dst.type !== "node") {
      const hasOwner = this._connections.some((c) => {
        if (c.toId !== toId) return false;
        const other = this.getNode(c.fromId);
        return other !== undefined && other.type === "node";
      });
      if (hasOwner) {
        return { ok: false, message: ownerRuleMessage(dst.type) };
      }
    }

    return { ok: true, message: "" };
  }

  /** Validate and add a connection, throwing ConnectionValidationError if invalid. */
  addConnection(fromId: string, toId: string): Connection {
    const { ok, message } = this.validateConnection(fromId, toId);
    if (!ok) {
      throw new ConnectionValidationError(message);
    }
    const connection: Connection = { fromId, toId };
    this._connections.push(connection);
    return connection;
  }

  removeConnection(connection: Connection): void {
    const idx = this._connections.findIndex(
      (c) => c.fromId === connection.fromId && c.toId === connection.toId
    );
    if (idx !== -1) {
      this._connections.splice(idx, 1);
    }
  }

  /** All connections touching the given node (as source or destination). */
  connectionsFor(nodeId: string): Connection[] {
    return this._connections.filter((c) => c.fromId === nodeId || c.toId === nodeId);
  }

  toDict(): GraphJSON {
    return {
      nodes: this.nodes.map(rosNodeToDict),
      connections: this._connections.map(connectionToDict),
    };
  }

  toJSON(indent = 2): string {
    return JSON.stringify(this.toDict(), null, indent);
  }

  static fromDict(data: GraphJSON): Graph {
    const graph = new Graph();
    for (const raw of data.nodes || []) {
      graph.addNode(rosNodeFromDict(raw));
    }
    for (const raw of data.connections || []) {
      const conn = connectionFromDict(raw);
      // Trust the file but skip anything that no longer validates so a
      // hand-edited project can never crash the app.
      const { ok } = graph.validateConnection(conn.fromId, conn.toId);
      if (ok) {
        graph._connections.push(conn);
      }
    }
    // Keep the id counter ahead of any numeric ids we just loaded.
    const numeric = graph.nodes
      .map((n) => n.id)
      .filter((id) => /^\d+$/.test(id))
      .map((id) => parseInt(id, 10));
    if (numeric.length > 0) {
      graph._idCounter = Math.max(...numeric) + 1;
    }
    return graph;
  }

  static fromJSON(text: string): Graph {
    return Graph.fromDict(JSON.parse(text));
  }

  clear(): void {
    this._nodes.clear();
    this._connections = [];
    this._idCounter = 1;
  }
}
