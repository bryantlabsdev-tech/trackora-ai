import { hasPremiumAccess } from './types/profile'
import { CoachingInputCard } from './components/coaching/CoachingInputCard'
import { CoachingModals } from './components/coaching/CoachingModals'
import { CoachingOutputPanel } from './components/coaching/CoachingOutputPanel'
import { CoachingTutorialOverlay } from './components/coaching/CoachingTutorialOverlay'
import { CoachingWorkspaceGate } from './components/coaching/CoachingWorkspaceGate'
import { useCoachingApp } from './hooks/useCoachingApp'
import './App.css'

export default function CoachingApp() {
  const vm = useCoachingApp()

  return (
    <div className="app" data-mobile-sticky-gen={vm.tutorialPhase === 'off' ? 'on' : 'off'}>
      {vm.workspaceGateOpen && (
        <CoachingWorkspaceGate
          coachingWorkspace={vm.coachingWorkspace}
          onSelect={(w) => void vm.selectCoachingWorkspace(w)}
        />
      )}

      {vm.tutorialPhase === 'spotlight_generate' && <div className="tutorial-dim" aria-hidden />}

      <header className="header">
        <p className="eyebrow">Trackora</p>
        <h1>Coaching form</h1>
        <p className="lede">
          <span className="lede-line">{vm.workspaceUI.ledePrimary}</span>
          <span className="lede-line lede-line--trust">{vm.workspaceUI.ledeTrust}</span>
        </p>
      </header>

      <div className="layout">
        <CoachingInputCard
          profile={vm.profile}
          profileLoading={vm.profileLoading}
          profileError={vm.profileError}
          workspaceUI={vm.workspaceUI}
          coachingWorkspace={vm.coachingWorkspace}
          quickTopicSelection={vm.quickTopicSelection}
          onQuickTopicChange={vm.onQuickTopicChange}
          formMode={vm.formMode}
          setFormMode={vm.setFormMode}
          input={vm.input}
          setInput={vm.setInput}
          invalidName={vm.invalidName}
          invalidReason={vm.invalidReason}
          tutorialHighlightQuickTopics={vm.tutorialHighlightQuickTopics}
          tutorialPhase={vm.tutorialPhase}
          tutorialHighlightGenerate={vm.tutorialHighlightGenerate}
          generateBtnRef={vm.generateBtnRef}
          loading={vm.loading}
          generationBlocked={vm.generationBlocked}
          onGenerate={() => void vm.generate()}
          showValidation={vm.showValidation}
          canGenerate={vm.canGenerate}
          generationError={vm.generationError}
          logText={vm.logText}
          onOpenPricing={() => vm.setShowPricingModal(true)}
          onRefresh={() => void vm.refresh()}
        />

        <CoachingOutputPanel
          outputCardRef={vm.outputCardRef}
          tutorialPhase={vm.tutorialPhase}
          loading={vm.loading}
          logText={vm.logText}
          logSource={vm.logSource}
          lastGenerationMs={vm.lastGenerationMs}
          workspaceUI={vm.workspaceUI}
          generationError={vm.generationError}
          parsedSections={vm.parsedSections}
          copyEntireSuccess={vm.copyEntireSuccess}
          onCopyEntireForm={() => void vm.copyEntireForm()}
          refinementQuota={vm.refinementQuota}
          refiningRowKey={vm.refiningRowKey}
          generationBlocked={vm.generationBlocked}
          profileLoading={vm.profileLoading}
          profile={vm.profile}
          refinePresetPick={vm.refinePresetPick}
          setRefinePresetPick={vm.setRefinePresetPick}
          refineCustomText={vm.refineCustomText}
          setRefineCustomText={vm.setRefineCustomText}
          refineOpenRowKey={vm.refineOpenRowKey}
          setRefineOpenRowKey={vm.setRefineOpenRowKey}
          refinedFlashKeys={vm.refinedFlashKeys}
          copiedSectionKeys={vm.copiedSectionKeys}
          onCopySection={(rowKey, label, body) => void vm.copySection(rowKey, label, body)}
          onApplyRefinement={(sectionId, rowKey, body) =>
            void vm.applySectionRefinement(sectionId, rowKey, body)
          }
          onRegenerate={() => vm.regenerate()}
          outputHelpfulness={vm.outputHelpfulness}
          setOutputHelpfulness={vm.setOutputHelpfulness}
        />
      </div>

      <p className="fine-print">
        Your notes are sent securely to generate your form — ready to copy, save, or share with your team. Review AI
        output before use.{' '}
        <a href="/privacy" className="fine-print-link">
          Privacy Policy
        </a>
        {' · '}
        <a href="/terms" className="fine-print-link">
          Terms
        </a>
        .
      </p>

      <CoachingTutorialOverlay
        tutorialPhase={vm.tutorialPhase}
        tutorialStepIndex={vm.tutorialStepIndex}
        tutorialStep={vm.tutorialStep}
        logText={vm.logText}
        tutorialDismissBusy={vm.tutorialDismissBusy}
        tutorialDismissError={vm.tutorialDismissError}
        onTutorialBack={vm.onTutorialBack}
        onTutorialNext={vm.onTutorialNext}
        onTutorialStartGenerating={vm.onTutorialStartGenerating}
        onDismissTutorial={() => void vm.dismissTutorialChrome()}
      />

      <CoachingModals
        profile={vm.profile}
        freeLimitBody={vm.workspaceUI.freeLimitBody}
        showRefinementLimitModal={vm.showRefinementLimitModal}
        onCloseRefinementLimit={() => vm.setShowRefinementLimitModal(false)}
        showLimitPaywall={vm.showLimitPaywall && Boolean(vm.profile && !hasPremiumAccess(vm.profile))}
        onCloseLimitPaywall={() => vm.setShowLimitPaywall(false)}
        showPricingModal={vm.showPricingModal}
        onClosePricingModal={() => vm.setShowPricingModal(false)}
        showWarmupNotice={vm.showWarmupNotice}
        copyFormToast={vm.copyFormToast}
        onBillingUpdated={() => void vm.refresh()}
      />
    </div>
  )
}
