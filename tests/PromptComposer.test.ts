import { PromptComposer } from '../modules/PromptComposer';
import { TestResult, CandidateTheme } from '../types';

const MOCK_SELECTED_CANDIDATE: CandidateTheme = {
  id: "c1",
  subject_type: "Hydraulic Press",
  action_verb: "Crush",
  object_type: "Smartphone",
  structure_type: "Experiment",
  algorithm_signals: ["satisfying", "tech"],
  selected: true,
  total_score: 25,
  scoring_breakdown: { virality: 9, feasibility: 8, trend_alignment: 8 }
};

const MOCK_UNSELECTED_CANDIDATE: CandidateTheme = {
  ...MOCK_SELECTED_CANDIDATE,
  id: "c2",
  selected: false
};

export const runPromptComposerTests = async (): Promise<TestResult> => {
  const logs: string[] = [];
  const module = new PromptComposer();

  logs.push("🚀 Starting PromptComposer Tests (Phase 4)...");

  try {
    // 1. Execution Test
    logs.push("Step 1: Executing module with Selected Candidate...");
    const result = await module.execute(MOCK_SELECTED_CANDIDATE);

    // 2. Schema & Content Validation
    logs.push("Step 2: Validating Output Content...");
    
    if (!result.prompt || result.prompt.length < 10) {
      throw new Error("Generated prompt is too short or missing");
    }
    logs.push(`   Prompt length: ${result.prompt.length} chars`);

    if (!result.title_template) throw new Error("Missing title_template");
    logs.push(`   Title: "${result.title_template}"`);

    if (result.candidate_id !== MOCK_SELECTED_CANDIDATE.id) {
      throw new Error(`Candidate ID mismatch: expected ${MOCK_SELECTED_CANDIDATE.id}, got ${result.candidate_id}`);
    }

    // 3. Reference Integrity Check
    logs.push("Step 3: Checking Reference Integrity...");
    if (result.candidate_reference.id !== MOCK_SELECTED_CANDIDATE.id) {
      throw new Error("candidate_reference ID does not match input");
    }
    if (result.candidate_reference.total_score !== 25) {
      throw new Error("candidate_reference data corrupted");
    }
    logs.push("✅ Reference object preserved correctly.");

    // 4. Edge Case: Unselected Candidate
    logs.push("Step 4: Testing Unselected Input...");
    try {
      await module.execute(MOCK_UNSELECTED_CANDIDATE);
      throw new Error("Module should throw error for unselected candidate");
    } catch (e: any) {
      if (e.message.includes("selected")) {
        logs.push("✅ Correctly rejected unselected candidate.");
      } else {
        throw e;
      }
    }

    logs.push("✅ ALL TESTS PASSED");
    return { moduleName: "PromptComposer", passed: true, logs };

  } catch (e: any) {
    logs.push(`❌ TEST FAILED: ${e.message}`);
    return { moduleName: "PromptComposer", passed: false, logs };
  }
};