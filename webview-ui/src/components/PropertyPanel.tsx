import React from "react";
import { RosNode } from "../model/RosNode";
import { listMessageTypes, messageKindForEntityType } from "../utils/messageTypes";
import { describeEdgeRole } from "../utils/roles";

interface ConnectedInterface {
  /** true if the edge points away from the selected entity. */
  outgoing: boolean;
  entity: RosNode;
}

interface Props {
  selectedNode: RosNode | undefined;
  connectedInterfaces: ConnectedInterface[];
  onChange: (patch: Partial<Pick<RosNode, "nodeName" | "topic" | "messageType">>) => void;
}

const PropertyPanel: React.FC<Props> = ({ selectedNode, connectedInterfaces, onChange }) => {
  if (!selectedNode) {
    return (
      <div className="property-panel">
        <div className="property-panel__empty">No entity selected</div>
      </div>
    );
  }

  const isNode = selectedNode.type === "node";

  return (
    <div className="property-panel">
      <label className="property-panel__field">
        <span>Entity name</span>
        <input
          type="text"
          value={selectedNode.nodeName}
          onChange={(e) => onChange({ nodeName: e.target.value })}
        />
      </label>

      {!isNode && (
        <>
          <label className="property-panel__field">
            <span>Topic / Service / Action</span>
            <input
              type="text"
              value={selectedNode.topic}
              onChange={(e) => onChange({ topic: e.target.value })}
            />
          </label>
          <label className="property-panel__field">
            <span>Message type</span>
            <select
              value={selectedNode.messageType}
              onChange={(e) => onChange({ messageType: e.target.value })}
            >
              {listMessageTypes(messageKindForEntityType(selectedNode.type)).map((mt) => (
                <option key={mt} value={mt}>
                  {mt}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <div className="property-panel__interfaces">
        <span className="property-panel__interfaces-title">
          {isNode ? "Publishers / subscribers / services / actions" : "Connected nodes"}
        </span>
        {connectedInterfaces.length === 0 ? (
          <div className="property-panel__interfaces-empty">
            {isNode
              ? "Not wired to anything yet -- drag a connection to a topic, service or action."
              : "No nodes connected yet."}
          </div>
        ) : (
          <ul className="property-panel__interfaces-list">
            {connectedInterfaces.map(({ outgoing, entity }) => (
              <li key={`${outgoing ? "out" : "in"}-${entity.id}`} className="property-panel__interface">
                <span className="property-panel__interface-role">
                  {describeEdgeRole(selectedNode.type, entity.type, outgoing)}
                </span>
                <span className="property-panel__interface-name" title={entity.nodeName}>
                  {entity.nodeName}
                </span>
                {entity.topic && (
                  <span className="property-panel__interface-detail" title={entity.topic}>
                    {entity.topic}
                  </span>
                )}
                {entity.messageType && (
                  <span className="property-panel__interface-detail" title={entity.messageType}>
                    {entity.messageType}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PropertyPanel;
