import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, StyleSheet, StatusBar, Alert, Share, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  RenderedTriangle,
  TriangleDef,
  StandaloneEdge,
  Point,
  EdgeSelection,
  InteractionState,
} from './types';
import { generateId, recalculateGeometry, distance } from './utils/geometryUtils';
import { PALETTE } from './constants';
import { useAsyncStorage } from './hooks/useStorage';

import { GeometryCanvas, GeometryCanvasHandle } from './components/canvas/GeometryCanvas';
import { FABGroup, FABGroupItem } from './components/ui/FAB';
import { ControlBar } from './components/ui/ControlBar';
import { TriangleSizeModal } from './components/ui/TriangleSizeModal';

// Icons as simple text (can replace with actual icon library)
const PencilIcon = () => <View style={styles.iconText}><Text style={styles.iconTextInner}>✏️</Text></View>;
const TriangleIcon = () => <View style={styles.iconText}><Text style={styles.iconTextInner}>△</Text></View>;
import { Text } from 'react-native';

export default function App() {
  // Triangle definitions (source of truth)
  const [defs, setDefs, defsLoading] = useAsyncStorage<TriangleDef[]>('geosolver_triangle_defs', [
    {
      id: generateId(),
      name: 'T1',
      color: PALETTE[0],
      isRoot: true,
      sideA: 5,
      sideB: 5,
      sideC: 5,
    },
  ]);

  // Standalone edges
  const [standaloneEdges, setStandaloneEdges] = useState<StandaloneEdge[]>([]);

  // Selection state
  const [selectedTriangleId, setSelectedTriangleId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<EdgeSelection | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Interaction state
  const [interaction, setInteraction] = useState<InteractionState>({ type: 'IDLE' });

  // Edit modes
  const [edgeEditMode, setEdgeEditMode] = useState(false);
  const [triangleEditMode, setTriangleEditMode] = useState(false);

  // Modal state for triangle size input
  const [triangleModalVisible, setTriangleModalVisible] = useState(false);
  const [pendingTriangle, setPendingTriangle] = useState<{
    triangleId: string;
    edgeIndex: 0 | 1 | 2;
    baseLength: number;
  } | null>(null);

  // Undo history
  const [history, setHistory] = useState<{ defs: TriangleDef[]; edges: StandaloneEdge[] }[]>([]);
  const isUndoing = useRef(false);
  const canvasRef = useRef<GeometryCanvasHandle>(null);
  const MAX_HISTORY = 50;

  // Derived geometry
  const geometry = useMemo(() => {
    return recalculateGeometry(defs);
  }, [defs]);

  // Save to history before changes
  const saveToHistory = useCallback(() => {
    if (isUndoing.current) return;
    setHistory((prev) => {
      const newHistory = [
        ...prev,
        {
          defs: JSON.parse(JSON.stringify(defs)),
          edges: JSON.parse(JSON.stringify(standaloneEdges)),
        },
      ];
      if (newHistory.length > MAX_HISTORY) {
        return newHistory.slice(-MAX_HISTORY);
      }
      return newHistory;
    });
  }, [defs, standaloneEdges]);

  // Undo
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;

    isUndoing.current = true;
    const prevState = history[history.length - 1];
    setDefs(prevState.defs);
    setStandaloneEdges(prevState.edges);
    setHistory((prev) => prev.slice(0, -1));

    setTimeout(() => {
      isUndoing.current = false;
    }, 0);
  }, [history, setDefs]);

  // Add standalone edge
  const handleAddStandaloneEdge = useCallback(
    (p1: Point, p2: Point) => {
      saveToHistory();
      const length = distance(p1, p2);
      const newEdge: StandaloneEdge = {
        id: generateId(),
        p1: { ...p1, id: generateId() },
        p2: { ...p2, id: generateId() },
        length,
      };
      setStandaloneEdges((prev) => [...prev, newEdge]);
    },
    [saveToHistory]
  );

  // Add triangle from standalone edge
  const handleAddTriangleFromEdge = useCallback(
    (edgeId: string, sideLeft: number, sideRight: number, flip: boolean) => {
      const edge = standaloneEdges.find((e) => e.id === edgeId);
      if (!edge) return;

      saveToHistory();

      // Create new root triangle
      const newDef: TriangleDef = {
        id: generateId(),
        name: `T${defs.length + 1}`,
        color: PALETTE[defs.length % PALETTE.length],
        isRoot: true,
        sideA: edge.length,
        sideB: sideLeft,
        sideC: sideRight,
        originP1: edge.p1,
        originP2: edge.p2,
        flip,
      };

      setDefs((prev) => [...prev, newDef]);
      // Remove the standalone edge
      setStandaloneEdges((prev) => prev.filter((e) => e.id !== edgeId));
    },
    [standaloneEdges, defs, saveToHistory, setDefs]
  );

  // Add attached triangle
  const handleAddAttachedTriangle = useCallback(
    (triangleId: string, edgeIndex: 0 | 1 | 2, sideLeft: number, sideRight: number, flip: boolean) => {
      saveToHistory();

      const newDef: TriangleDef = {
        id: generateId(),
        name: `T${defs.length + 1}`,
        color: PALETTE[defs.length % PALETTE.length],
        isRoot: false,
        attachedToTriangleId: triangleId,
        attachedEdgeIndex: edgeIndex,
        sideLeft,
        sideRight,
        flip,
      };

      setDefs((prev) => [...prev, newDef]);
    },
    [defs, saveToHistory, setDefs]
  );

  // Watch for PHANTOM_PLACING to show modal
  useEffect(() => {
    if (interaction.type === 'PHANTOM_PLACING') {
      const baseLength = distance(interaction.p1, interaction.p2);
      setPendingTriangle({
        triangleId: interaction.tId,
        edgeIndex: interaction.index,
        baseLength,
      });
      setTriangleModalVisible(true);
    }
  }, [interaction]);

  // Handle modal confirm
  const handleTriangleModalConfirm = useCallback((sideLeft: number, sideRight: number, flip: boolean) => {
    if (pendingTriangle) {
      handleAddAttachedTriangle(
        pendingTriangle.triangleId,
        pendingTriangle.edgeIndex,
        sideLeft,
        sideRight,
        flip
      );
    }
    setTriangleModalVisible(false);
    setPendingTriangle(null);
    setInteraction({ type: 'IDLE' });
  }, [pendingTriangle, handleAddAttachedTriangle]);

  // Handle modal cancel
  const handleTriangleModalCancel = useCallback(() => {
    setTriangleModalVisible(false);
    setPendingTriangle(null);
    setInteraction({ type: 'IDLE' });
  }, []);

  // Delete triangle
  const handleDeleteTriangle = useCallback(
    (id: string) => {
      saveToHistory();
      setDefs((prev) => prev.filter((d) => d.id !== id));
      setSelectedTriangleId(null);
      setSelectedEdge(null);
    },
    [saveToHistory, setDefs]
  );

  // Delete standalone edge
  const handleDeleteStandaloneEdge = useCallback(
    (id: string) => {
      saveToHistory();
      setStandaloneEdges((prev) => prev.filter((e) => e.id !== id));
      setSelectedEdge(null);
    },
    [saveToHistory]
  );

  // Delete selected triangles (bulk delete)
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    Alert.alert(
      '削除',
      `選択中の${selectedIds.size}個の三角形を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            saveToHistory();
            setDefs((prev) => prev.filter((d) => !selectedIds.has(d.id)));
            setSelectedIds(new Set());
            setSelectedTriangleId(null);
            setSelectedEdge(null);
          },
        },
      ]
    );
  }, [selectedIds, saveToHistory, setDefs]);

  // Reset all
  const handleReset = useCallback(() => {
    Alert.alert(
      'リセット',
      'すべてのデータを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            saveToHistory();
            setDefs([
              {
                id: generateId(),
                name: 'T1',
                color: PALETTE[0],
                isRoot: true,
                sideA: 5,
                sideB: 5,
                sideC: 5,
              },
            ]);
            setStandaloneEdges([]);
            setSelectedTriangleId(null);
            setSelectedEdge(null);
            setSelectedIds(new Set());
          },
        },
      ]
    );
  }, [saveToHistory, setDefs]);

  // Export (placeholder)
  const handleExport = useCallback(async () => {
    try {
      // Generate simple text export for now
      const data = {
        triangles: geometry.triangles.map((t) => ({
          name: t.name,
          vertices: [
            { x: t.p1.x.toFixed(2), y: t.p1.y.toFixed(2) },
            { x: t.p2.x.toFixed(2), y: t.p2.y.toFixed(2) },
            { x: t.p3.x.toFixed(2), y: t.p3.y.toFixed(2) },
          ],
        })),
        edges: standaloneEdges.map((e) => ({
          length: e.length.toFixed(2),
          p1: { x: e.p1.x.toFixed(2), y: e.p1.y.toFixed(2) },
          p2: { x: e.p2.x.toFixed(2), y: e.p2.y.toFixed(2) },
        })),
      };

      await Share.share({
        message: JSON.stringify(data, null, 2),
        title: 'Geometry Export',
      });
    } catch (error) {
      console.error('Export error:', error);
    }
  }, [geometry.triangles, standaloneEdges]);

  // Zoom handlers - connected to canvas via ref
  const handleZoomIn = useCallback(() => {
    canvasRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    canvasRef.current?.zoomOut();
  }, []);

  const handleFitToContent = useCallback(() => {
    canvasRef.current?.fitToContent();
  }, []);

  if (defsLoading) {
    return (
      <View style={styles.loading}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />

        {/* Canvas */}
        <GeometryCanvas
          ref={canvasRef}
          triangles={geometry.triangles}
          standaloneEdges={standaloneEdges}
          selectedTriangleId={selectedTriangleId}
          selectedEdge={selectedEdge}
          selectedIds={selectedIds}
          interaction={interaction}
          edgeEditMode={edgeEditMode}
          triangleEditMode={triangleEditMode}
          onSelectTriangle={setSelectedTriangleId}
          onSelectEdge={setSelectedEdge}
          onSelectIds={setSelectedIds}
          onInteractionChange={setInteraction}
          onAddStandaloneEdge={handleAddStandaloneEdge}
          onAddTriangleFromEdge={handleAddTriangleFromEdge}
          onAddAttachedTriangle={handleAddAttachedTriangle}
          onDeleteTriangle={handleDeleteTriangle}
          onDeleteStandaloneEdge={handleDeleteStandaloneEdge}
        />

        {/* FAB Group */}
        <FABGroup position="top-right">
          <FABGroupItem
            onPress={() => setEdgeEditMode((prev) => !prev)}
            icon={<Text style={styles.fabIconText}>✏️</Text>}
            isActive={edgeEditMode}
            activeColor="#3b82f6"
            inactiveColor="#9ca3af"
          />
          <FABGroupItem
            onPress={() => setTriangleEditMode((prev) => !prev)}
            icon={<Text style={styles.fabIconText}>△</Text>}
            isActive={triangleEditMode}
            activeColor="#22c55e"
            inactiveColor="#9ca3af"
          />
        </FABGroup>

        {/* Delete Selected Button */}
        {selectedIds.size > 0 && (
          <View style={styles.deleteButtonContainer}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteSelected}
            >
              <Text style={styles.deleteButtonText}>
                {selectedIds.size}個を削除
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Control Bar */}
        <ControlBar
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitToContent={handleFitToContent}
          onUndo={handleUndo}
          onReset={handleReset}
          onExport={handleExport}
          canUndo={history.length > 0}
        />
      {/* Triangle Size Modal */}
        <TriangleSizeModal
          visible={triangleModalVisible}
          baseLength={pendingTriangle?.baseLength ?? 0}
          onConfirm={handleTriangleModalConfirm}
          onCancel={handleTriangleModalCancel}
        />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  deleteButtonContainer: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 50,
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  iconText: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconTextInner: {
    fontSize: 18,
  },
  fabIconText: {
    fontSize: 24,
    color: 'white',
  },
});
