import type { PhasesFile, TaskFile } from "../../schemas/phases.js";
import type { InitProjectInput } from "../types.js";

export function phasePlanTemplate(_input: InitProjectInput): PhasesFile {
  const phases = [
    {
      id: "phase-0-setup",
      name: "Project Setup",
      phase_number: 0,
      status: "in-progress" as const,
      description:
        "Initialize Unity project structure, configure input system, core game loop, and assembly definitions",
      gate_requirements: [
        "Unity project opens and runs without errors",
        "Assembly definitions (.asmdef) created for each module",
        "Basic scene loads and game loop runs at target FPS",
        "Development tooling configured (version control, IDE, logging)",
      ],
    },
    {
      id: "phase-1-core",
      name: "Core Systems",
      phase_number: 1,
      status: "planned" as const,
      description:
        "Player controller, camera system, game state machine, data architecture with ScriptableObjects",
      gate_requirements: [
        "Player input responds and controls character/object",
        "Camera system follows player correctly",
        "Game state machine handles transitions (menu, playing, paused)",
        "ScriptableObject data architecture established",
        "Quality scenarios PERF-01, MAINT-01 verified",
      ],
    },
    {
      id: "phase-2-gameplay",
      name: "Gameplay Features",
      phase_number: 2,
      status: "planned" as const,
      description:
        "Core game mechanics, level design, UI framework, audio integration, save/load system",
      gate_requirements: [
        "Core gameplay loop complete and playable",
        "UI framework in place (HUD, menus, dialogs)",
        "Audio system integrated (music, SFX)",
        "Save/load system working",
        "Performance targets met on target platforms",
      ],
    },
    {
      id: "phase-3-polish",
      name: "Polish & Launch",
      phase_number: 3,
      status: "planned" as const,
      description:
        "Performance profiling, accessibility, platform-specific builds, bug fixes, and release",
      gate_requirements: [
        "All quality scenarios passing",
        "Accessibility audit complete",
        "Platform-specific builds tested and optimized",
        "No critical or major bugs outstanding",
        "Release build successful",
      ],
    },
  ];

  return { schema_version: 1, phases };
}

export function phaseTasksTemplate(
  _input: InitProjectInput,
  phaseId: string,
): TaskFile | null {
  const tasksByPhase: Record<string, TaskFile> = {
    "phase-0-setup": {
      schema_version: 1,
      phase_id: "phase-0-setup",
      tasks: [
        {
          id: "task-0.1-project-structure",
          title: "Set up Unity project folder structure and assembly definitions",
          status: "todo",
          building_block: "game-core",
          quality_scenarios: ["MAINT-01"],
          acceptance_criteria: [
            "Folder structure: Assets/Scripts/{Core,Input,Player,Gameplay,UI,Audio,Data}, Assets/Editor/",
            "Assembly definition (.asmdef) for each script folder",
            "Version control configured (.gitignore for Library/, Temp/, Logs/)",
          ],
        },
        {
          id: "task-0.2-core-loop",
          title: "Implement core game loop and GameManager",
          status: "todo",
          building_block: "game-core",
          quality_scenarios: ["PERF-01"],
          acceptance_criteria: [
            "GameManager handles game lifecycle (init, run, pause, quit)",
            "Main scene loads and runs at target frame rate",
            "Debug logging infrastructure in place",
          ],
        },
        {
          id: "task-0.3-input-system",
          title: "Configure Unity Input System",
          status: "todo",
          building_block: "input-system",
          quality_scenarios: [],
          acceptance_criteria: [
            "New Input System package installed and configured",
            "Input action asset with default action maps",
            "Input abstraction layer for platform-independent handling",
          ],
        },
        {
          id: "task-0.4-testing",
          title: "Set up testing infrastructure",
          status: "todo",
          quality_scenarios: ["MAINT-02"],
          acceptance_criteria: [
            "EditMode test assembly created (NUnit)",
            "PlayMode test assembly created",
            "Basic test for GameManager lifecycle",
          ],
        },
      ],
    },
    "phase-1-core": {
      schema_version: 1,
      phase_id: "phase-1-core",
      tasks: [
        {
          id: "task-1.1-player-controller",
          title: "Implement player controller and movement",
          status: "todo",
          building_block: "player-systems",
          quality_scenarios: ["PERF-06"],
          acceptance_criteria: [
            "Player character spawns and responds to input",
            "Movement feels responsive (< 100ms input-to-visual)",
            "Physics/collision configured correctly",
          ],
        },
        {
          id: "task-1.2-camera-system",
          title: "Implement camera system",
          status: "todo",
          building_block: "player-systems",
          quality_scenarios: [],
          acceptance_criteria: [
            "Camera follows player smoothly",
            "Camera handles transitions and edge cases",
            "Camera settings configurable via ScriptableObject",
          ],
        },
        {
          id: "task-1.3-data-architecture",
          title: "Set up ScriptableObject data architecture",
          status: "todo",
          building_block: "data-layer",
          quality_scenarios: [],
          acceptance_criteria: [
            "ScriptableObject base types for game config, events, and data",
            "Event channel pattern for decoupled communication",
            "Game settings accessible from ScriptableObject assets",
          ],
        },
        {
          id: "task-1.4-state-machine",
          title: "Implement game state machine",
          status: "todo",
          building_block: "game-core",
          quality_scenarios: [],
          acceptance_criteria: [
            "State machine handles: MainMenu, Loading, Playing, Paused, GameOver",
            "Clean transitions between states",
            "State-specific systems enabled/disabled correctly",
          ],
        },
        {
          id: "task-1.5-document-decisions",
          title: "Document architectural decisions as ADRs",
          status: "todo",
          quality_scenarios: [],
          acceptance_criteria: [
            "ADR for each significant architecture/pattern choice",
            "ADRs linked to affected building blocks and code paths",
          ],
        },
      ],
    },
  };

  return tasksByPhase[phaseId] ?? null;
}
