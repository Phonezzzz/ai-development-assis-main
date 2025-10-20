import { useCallback } from 'react';
import { useModeOrchestratorStore } from '@/stores/mode-orchestrator-store';
import type { OperatingMode, WorkspaceModeType } from '@/stores/mode-orchestrator-store';

interface UIState {
  currentMode: OperatingMode;
  currentWorkspaceMode: WorkspaceModeType;
  sidebarCollapsed: boolean;
  showImageGallery: boolean;
  showRoutingMonitor: boolean;
  showTestSuite: boolean;
}

export function useShellUIState() {
  const currentMode = useModeOrchestratorStore((state) => state.ui.currentMode);
  const currentWorkspaceMode = useModeOrchestratorStore(
    (state) => state.ui.currentWorkspaceMode,
  );
  const sidebarCollapsed = useModeOrchestratorStore((state) => state.ui.sidebarCollapsed);
  const showImageGallery = useModeOrchestratorStore((state) => state.ui.showImageGallery);
  const showRoutingMonitor = useModeOrchestratorStore((state) => state.ui.showRoutingMonitor);
  const showTestSuite = useModeOrchestratorStore((state) => state.ui.showTestSuite);

  const {
    setCurrentMode: storeSetCurrentMode,
    setWorkspaceMode: storeSetWorkspaceMode,
    toggleSidebar: storeToggleSidebar,
    setSidebarCollapsed: storeSetSidebarCollapsed,
    setShowImageGallery: storeSetShowImageGallery,
    setShowRoutingMonitor: storeSetShowRoutingMonitor,
    setShowTestSuite: storeSetShowTestSuite,
  } = useModeOrchestratorStore((state) => state.actions);

  const uiState: UIState = {
    currentMode,
    currentWorkspaceMode,
    sidebarCollapsed,
    showImageGallery,
    showRoutingMonitor,
    showTestSuite,
  };

  const handleModeChange = useCallback(
    (mode: OperatingMode) => {
      storeSetCurrentMode(mode);
    },
    [storeSetCurrentMode],
  );

  const handleSidebarToggle = useCallback(() => {
    storeToggleSidebar();
  }, [storeToggleSidebar]);

  const handleToggleGallery = useCallback(() => {
    storeSetShowImageGallery(!showImageGallery);
  }, [storeSetShowImageGallery, showImageGallery]);

  const handleToggleRoutingMonitor = useCallback(() => {
    storeSetShowRoutingMonitor(!showRoutingMonitor);
  }, [storeSetShowRoutingMonitor, showRoutingMonitor]);

  const handleToggleTestSuite = useCallback(() => {
    storeSetShowTestSuite(!showTestSuite);
  }, [storeSetShowTestSuite, showTestSuite]);

  return {
    uiState,
    handleModeChange,
    handleSidebarToggle,
    handleToggleGallery,
    handleToggleRoutingMonitor,
    handleToggleTestSuite,
    storeSetWorkspaceMode,
    storeSetSidebarCollapsed,
  };
}
