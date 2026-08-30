import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  Node as RFNode,
  Edge as RFEdge,
  Connection as RFConnection,
  NodeChange,
  OnSelectionChangeParams,
} from "reactflow";
import "reactflow/dist/style.css";

import { Graph, ConnectionValidationError } from "./model/Graph";
import { NodeType, nodeTypeLabel } from "./model/NodeType";
import { RosNode } from "./model/RosNode";
import { Connection } from "./model/Connection";
import { defaultMessageType } from "./utils/messageTypes";
import { sanitizeIdentifier } from "./utils/naming";
import { nodeTypes, RosFlowNodeData } from "./components/RosFlowNode";
import Toolbar from "./components/Toolbar";
import PropertyPanel from "./components/PropertyPanel";
import { getVsCodeApi } from "./vscodeApi";

function toRFNode(node: RosNode): RFNode<RosFlowNodeData> {
  return {
    id: node.id,
    type: node.type,
    position: { x: node.x, y: node.y },
    data: { rosNode: node },
  };
}

function toRFEdge(c: Connection): RFEdge {
  return { id: `${c.fromId}->${c.toId}`, source: c.fromId, target: c.toId };
}

const Designer: React.FC = () => {
  const vscode = useMemo(() => getVsCodeApi(), []);
  const graphRef = useRef(new Graph());
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<RosFlowNodeData>([]);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState<Record<string, never>>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string>("");

  const selectedRosNode = useMemo(() => {
    if (!selectedId) return undefined;
    return nodes.find((n) => n.id === selectedId)?.data.rosNode;
  }, [selectedId, nodes]);

  const syncFromGraph = useCallback(
    (graph: Graph) => {
      setNodes(graph.nodes.map(toRFNode));
      setEdges(graph.connections.map(toRFEdge));
    },
    [setNodes, setEdges]
  );

  const getViewportCenter = useCallback(() => {
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!bounds) return { x: 250, y: 250 };
    return reactFlowInstance.project({ x: bounds.width / 2, y: bounds.height / 2 });
  }, [reactFlowInstance]);

  const handleAdd = useCallback(
    (type: NodeType) => {
      const graph = graphRef.current;
      const label = nodeTypeLabel(type);
      const count = graph.nodes.filter((n) => n.type === type).length + 1;
      const nodeName = `${label} #${count}`;
      const topic = `/${label.toLowerCase()}_${count}`;
      const center = getViewportCenter();
      const rosNode = graph.createNode(type, nodeName, topic, defaultMessageType(), center.x, center.y);
      setNodes((nds) => [...nds, toRFNode(rosNode)]);
    },
    [getViewportCenter, setNodes]
  );

  const handleConnect = useCallback(
    (connection: RFConnection) => {
      if (!connection.source || !connection.target) return;
      try {
        graphRef.current.addConnection(connection.source, connection.target);
        setEdges((eds) =>
          addEdge({ ...connection, id: `${connection.source}->${connection.target}` }, eds)
        );
        setStatus("");
      } catch (err) {
        setStatus(err instanceof ConnectionValidationError ? err.message : String(err));
      }
    },
    [setEdges]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeInternal(changes);
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          const n = graphRef.current.getNode(change.id);
          if (n) {
            n.x = change.position.x;
            n.y = change.position.y;
          }
        }
      }
    },
    [onNodesChangeInternal]
  );

  const handleNodesDelete = useCallback((deleted: RFNode[]) => {
    for (const n of deleted) {
      graphRef.current.removeNode(n.id);
    }
  }, []);

  const handleEdgesDelete = useCallback((deleted: RFEdge[]) => {
    for (const e of deleted) {
      if (e.source && e.target) {
        graphRef.current.removeConnection({ fromId: e.source, toId: e.target });
      }
    }
  }, []);

  const handleSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedId(params.nodes.length === 1 ? params.nodes[0].id : undefined);
  }, []);

  const handlePropertyChange = useCallback(
    (patch: Partial<Pick<RosNode, "nodeName" | "topic" | "messageType">>) => {
      if (!selectedId) return;
      const graph = graphRef.current;
      const node = graph.getNode(selectedId);
      if (!node) return;
      Object.assign(node, patch);

      // Mirror the original app's behavior: after any field edit, re-validate all
      // existing connections and drop ones whose endpoints no longer share a
      // message type.
      const stillValidKeys = new Set<string>();
      const toRemove: Connection[] = [];
      for (const c of graph.connections) {
        const a = graph.getNode(c.fromId);
        const b = graph.getNode(c.toId);
        if (a && b && a.messageType === b.messageType) {
          stillValidKeys.add(`${c.fromId}->${c.toId}`);
        } else {
          toRemove.push(c);
        }
      }
      for (const c of toRemove) {
        graph.removeConnection(c);
      }

      setNodes((nds) =>
        nds.map((n) => (n.id === selectedId ? { ...n, data: { rosNode: { ...node } } } : n))
      );
      setEdges((eds) => eds.filter((e) => stillValidKeys.has(`${e.source}->${e.target}`)));
    },
    [selectedId, setNodes, setEdges]
  );

  const handleNewProject = useCallback(() => {
    graphRef.current.clear();
    setNodes([]);
    setEdges([]);
    setSelectedId(undefined);
    setStatus("New project created.");
  }, [setNodes, setEdges]);

  const handleSaveProject = useCallback(() => {
    vscode.postMessage({ type: "saveProject", payload: graphRef.current.toJSON() });
  }, [vscode]);

  const handleOpenProject = useCallback(() => {
    vscode.postMessage({ type: "openProject" });
  }, [vscode]);

  const handleGeneratePackage = useCallback(() => {
    const graph = graphRef.current;
    const firstNode = graph.nodes.find((n) => n.type === "node");
    const suggestedName = firstNode
      ? sanitizeIdentifier(firstNode.nodeName, "my_ros_package")
      : "my_ros_package";
    vscode.postMessage({
      type: "generatePackage",
      payload: { graphJson: graph.toJSON(), suggestedName },
    });
  }, [vscode]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const message = event.data;
      switch (message?.type) {
        case "projectLoaded": {
          const graph = Graph.fromJSON(message.payload);
          graphRef.current = graph;
          syncFromGraph(graph);
          setSelectedId(undefined);
          setStatus("Project loaded.");
          break;
        }
        case "projectSaved":
          setStatus(`Project saved to ${message.path}`);
          break;
        case "packageGenerated":
          setStatus(`Package generated at ${message.path}`);
          break;
        case "error":
          setStatus(`Error: ${message.message}`);
          break;
        case "triggerAction":
          if (message.action === "newProject") handleNewProject();
          else if (message.action === "saveProject") handleSaveProject();
          else if (message.action === "openProject") handleOpenProject();
          break;
        default:
          break;
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [syncFromGraph, handleNewProject, handleSaveProject, handleOpenProject]);

  return (
    <div className="app">
      <Toolbar
        onAdd={handleAdd}
        onGeneratePackage={handleGeneratePackage}
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProject}
        onNewProject={handleNewProject}
      />
      <div className="app__body">
        <div className="app__canvas" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChangeInternal}
            onConnect={handleConnect}
            onNodesDelete={handleNodesDelete}
            onEdgesDelete={handleEdgesDelete}
            onSelectionChange={handleSelectionChange}
            deleteKeyCode={["Delete", "Backspace"]}
            fitView
          >
            <Background gap={16} />
            <Controls />
          </ReactFlow>
        </div>
        <PropertyPanel selectedNode={selectedRosNode} onChange={handlePropertyChange} />
      </div>
      <div className="status-bar">{status}</div>
    </div>
  );
};

const App: React.FC = () => (
  <ReactFlowProvider>
    <Designer />
  </ReactFlowProvider>
);

export default App;
