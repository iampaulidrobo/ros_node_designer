import { NodeType } from "../model/NodeType";

/** Label for the entity that *owns* a topic/service/action (mirrors "publisher"). */
function ownerRole(kind: NodeType): string {
  if (kind === "topic") return "Publisher";
  if (kind === "service") return "Service server";
  return "Action server";
}

/** Label for the entity that *consumes* a topic/service/action (mirrors "subscriber"). */
function consumerRole(kind: NodeType): string {
  if (kind === "topic") return "Subscriber";
  if (kind === "service") return "Service client";
  return "Action client";
}

/**
 * Describe one edge from the perspective of the currently selected entity
 * (`selfType`), regardless of which side of the connection it's on. A "node"
 * entity's role depends on direction relative to the topic/service/action it's
 * wired to; a topic/service/action's role is the mirror image of whichever
 * node it's wired to.
 */
export function describeEdgeRole(selfType: NodeType, otherType: NodeType, outgoingFromSelf: boolean): string {
  const entityKind = selfType === "node" ? otherType : selfType;
  const nodeOwnsEntity = selfType === "node" ? outgoingFromSelf : !outgoingFromSelf;
  return nodeOwnsEntity ? ownerRole(entityKind) : consumerRole(entityKind);
}
