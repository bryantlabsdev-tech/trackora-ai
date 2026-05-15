import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CoachingApiError, FreeLimitReachedError, requestCoachingLog } from '../api/requestCoachingLog'
import {
  RefinementMonthlyLimitError,
  RefinementRequiresProError,
  requestRefineSection,
} from '../api/requestRefineSection'
import { useProfile } from '../context/ProfileContext'
import { usePostTutorialFeedbackNudge } from '../context/PostTutorialFeedbackNudgeContext'
import type {
  CoachingFormSectionLabel,
  CoachingLogApiPayload,
  CoachingWorkspace,
  FormMode,
  RefinePreset,
  SimpleCoachingInput,
} from '../types/coaching'
import { coachingTopicOptionById } from '../data/coachingTopicGroups'
import { SESSION_PAYWALL_SHOWN_KEY, SESSION_WARMUP_TIP_KEY } from '../data/coachingPaywallCopy'
import { TUTORIAL_SAMPLE, TUTORIAL_STEPS, type TutorialPhase } from '../data/coachingTutorial'
import { WORKSPACE_UI } from '../data/coachingWorkspaceUi'
import { emptyInput, readWorkspaceFromStorage } from '../lib/coachingFormHelpers'
import {
  canUseAiGeneration,
  freeGenerationsRemaining,
  getRefinementQuotaForProfile,
  hasPremiumAccess,
  isFreeLimitReached,
} from '../types/profile'
import { persistCoachingWorkspace } from '../lib/profileApi'
import { supabase } from '../lib/supabase'
import { WORKSPACE_STORAGE_KEY } from '../lib/workspaceLabels'
import {
  copyPlainTextToClipboard,
  formatCoachingFormForClipboard,
  formatSectionClipboardBlock,
} from '../lib/formatCoachingFormClipboard'
import { mergeRefinedSectionIntoLog } from '../lib/mergeRefinedSection'
import { parseCoachingLogMarkdown } from '../lib/parseCoachingLog'

export function useCoachingApp() {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    applyUsageSnapshot,
    applyRefinementSnapshot,
    completeTutorial,
    refresh,
  } = useProfile()
  const { triggerPostTutorialFeedbackNudge } = usePostTutorialFeedbackNudge()
  const [input, setInput] = useState<SimpleCoachingInput>(emptyInput)
  const [formMode, setFormMode] = useState<FormMode>('coaching')
  const [coachingWorkspace, setCoachingWorkspace] = useState<CoachingWorkspace>('mobile_sales')
  const [quickTopicSelection, setQuickTopicSelection] = useState('')
  const [showValidation, setShowValidation] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [logText, setLogText] = useState<string | null>(null)
  const [logSource, setLogSource] = useState<'openai' | 'deterministic' | 'fallback' | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastGenerationMs, setLastGenerationMs] = useState<number | null>(null)
  const [showLimitPaywall, setShowLimitPaywall] = useState(false)
  const [showRefinementLimitModal, setShowRefinementLimitModal] = useState(false)
  const [showPricingModal, setShowPricingModal] = useState(false)
  /** Per-section copy feedback, keyed by `${sec.id}-${index}` */
  const [copiedSectionKeys, setCopiedSectionKeys] = useState<Record<string, boolean>>({})
  const [showWarmupNotice, setShowWarmupNotice] = useState(false)
  /** If sessionStorage is blocked, still only show the tip once per tab load */
  const warmupFallbackUsedRef = useRef(false)
  const [tutorialPhase, setTutorialPhase] = useState<TutorialPhase>('off')
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)
  const tutorialPhaseRef = useRef<TutorialPhase>('off')
  const generateBtnRef = useRef<HTMLButtonElement>(null)
  const outputCardRef = useRef<HTMLElement>(null)
  const [outputHelpfulness, setOutputHelpfulness] = useState<'yes' | 'no' | null>(null)
  const [copyFormToast, setCopyFormToast] = useState(false)
  const [copyEntireSuccess, setCopyEntireSuccess] = useState(false)
  const [refineOpenRowKey, setRefineOpenRowKey] = useState<string | null>(null)
  const [refinePresetPick, setRefinePresetPick] = useState<RefinePreset | null>(null)
  const [refineCustomText, setRefineCustomText] = useState('')
  const [refiningRowKey, setRefiningRowKey] = useState<string | null>(null)
  const [refinedFlashKeys, setRefinedFlashKeys] = useState<Record<string, boolean>>({})
  const [tutorialDismissBusy, setTutorialDismissBusy] = useState(false)
  const [tutorialDismissError, setTutorialDismissError] = useState<string | null>(null)
  const tutorialDismissBusyRef = useRef(false)
  const coachingWorkspaceRef = useRef<CoachingWorkspace>(coachingWorkspace)
  coachingWorkspaceRef.current = coachingWorkspace

  const resetWorkspaceScopedFormState = useCallback(() => {
    setInput(emptyInput())
    setFormMode('coaching')
    setQuickTopicSelection('')
    setShowValidation(false)
    setGenerationError(null)
    setLogText(null)
    setLogSource(null)
    setLastGenerationMs(null)
    setOutputHelpfulness(null)
    setCopiedSectionKeys({})
    setRefineOpenRowKey(null)
    setRefinePresetPick(null)
    setRefineCustomText('')
    setRefinedFlashKeys({})
    setCopyFormToast(false)
    setCopyEntireSuccess(false)
  }, [])

  useEffect(() => {
    tutorialPhaseRef.current = tutorialPhase
  }, [tutorialPhase])

  useEffect(() => {
    if (profileLoading || !profile) return
    if (profile.needs_coaching_workspace_setup) return
    // Supabase `has_seen_tutorial` is the source of truth (see mark_tutorial_seen / reset_tutorial_for_replay).
    if (!profile.has_seen_tutorial) {
      setTutorialPhase((p) => {
        if (p === 'walkthrough' || p === 'spotlight_generate' || p === 'spotlight_output') return p
        return 'walkthrough'
      })
    } else {
      setTutorialPhase((p) => (p === 'spotlight_output' ? p : 'off'))
    }
  }, [profileLoading, profile?.has_seen_tutorial, profile?.needs_coaching_workspace_setup])

  useEffect(() => {
    if (tutorialPhase !== 'walkthrough') return
    setTutorialStepIndex(0)
    setLogText(null)
    setLogSource(null)
    setLastGenerationMs(null)
  }, [tutorialPhase])

  useEffect(() => {
    if (profile && hasPremiumAccess(profile)) setShowLimitPaywall(false)
  }, [profile])

  useEffect(() => {
    if (profileLoading || !profile) return
    if (profile.needs_coaching_workspace_setup) {
      setCoachingWorkspace(profile.coaching_workspace)
      return
    }
    const fromLs = readWorkspaceFromStorage()
    const resolved = fromLs ?? profile.coaching_workspace
    const local = coachingWorkspaceRef.current
    if (resolved !== local) {
      resetWorkspaceScopedFormState()
      setCoachingWorkspace(resolved)
    }
    if (fromLs && fromLs !== profile.coaching_workspace && supabase) {
      void persistCoachingWorkspace(supabase, fromLs).then((r) => {
        if (r.ok) void refresh()
      })
    }
  }, [
    profileLoading,
    profile?.id,
    profile?.coaching_workspace,
    profile?.needs_coaching_workspace_setup,
    refresh,
    resetWorkspaceScopedFormState,
  ])

  useEffect(() => {
    if (!quickTopicSelection) return
    if (!coachingTopicOptionById(coachingWorkspace, quickTopicSelection)) {
      setQuickTopicSelection('')
    }
  }, [coachingWorkspace, quickTopicSelection])

  const selectCoachingWorkspace = useCallback(
    async (next: CoachingWorkspace) => {
      const onboarding = profile?.needs_coaching_workspace_setup === true
      if (!onboarding && next === coachingWorkspace) return
      if (next !== coachingWorkspace || onboarding) {
        resetWorkspaceScopedFormState()
      }
      setCoachingWorkspace(next)
      try {
        localStorage.setItem(WORKSPACE_STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      if (supabase && profile?.id) {
        const r = await persistCoachingWorkspace(supabase, next)
        if (!r.ok) console.error('[workspace]', r.error)
        await refresh()
      }
    },
    [
      coachingWorkspace,
      profile?.id,
      profile?.needs_coaching_workspace_setup,
      refresh,
      resetWorkspaceScopedFormState,
    ],
  )

  const workspaceUI = WORKSPACE_UI[coachingWorkspace]

  const refinementQuota = useMemo(
    () => getRefinementQuotaForProfile(profile, profile?.email ?? null),
    [profile],
  )

  useEffect(() => {
    if (refinementQuota.canRefine) setShowRefinementLimitModal(false)
  }, [refinementQuota.canRefine])

  useEffect(() => {
    if (!showPricingModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPricingModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showPricingModal])

  const dismissTutorialChrome = useCallback(async () => {
    if (tutorialDismissBusyRef.current) return
    tutorialDismissBusyRef.current = true
    setTutorialDismissBusy(true)
    setTutorialDismissError(null)
    try {
      const ok = await completeTutorial()
      if (!ok) {
        setTutorialDismissError(
          'Could not save tutorial completion. Check your connection and try again — it may show again after refresh.',
        )
        return
      }
      setTutorialPhase('off')
    } finally {
      tutorialDismissBusyRef.current = false
      setTutorialDismissBusy(false)
    }
  }, [completeTutorial])

  useEffect(() => {
    if (tutorialPhase !== 'spotlight_output' || !logText) return
    const el = outputCardRef.current
    if (!el) return
    window.requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, [tutorialPhase, logText])

  useEffect(() => {
    if (tutorialPhase !== 'spotlight_output') return
    const id = window.setTimeout(() => void dismissTutorialChrome(), 4200)
    return () => clearTimeout(id)
  }, [tutorialPhase, dismissTutorialChrome])

  const onTutorialStartGenerating = useCallback(() => {
    setInput(TUTORIAL_SAMPLE)
    setQuickTopicSelection('')
    setShowValidation(false)
    setTutorialPhase('spotlight_generate')
    window.requestAnimationFrame(() => {
      generateBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  const onTutorialNext = useCallback(() => {
    setTutorialStepIndex((s) => Math.min(TUTORIAL_STEPS.length - 1, s + 1))
  }, [])

  const onTutorialBack = useCallback(() => {
    setTutorialStepIndex((s) => Math.max(0, s - 1))
  }, [])

  useEffect(() => {
    if (!showWarmupNotice) return
    const id = window.setTimeout(() => setShowWarmupNotice(false), 5000)
    return () => clearTimeout(id)
  }, [showWarmupNotice])

  const canGenerate = useMemo(() => {
    return input.employeeName.trim().length > 0 && input.coachingReason.trim().length > 0
  }, [input])

  const payload = useMemo((): CoachingLogApiPayload => {
    return {
      employeeName: input.employeeName.trim(),
      coachingReason: input.coachingReason.trim(),
      notes: input.notes.trim(),
      mode: formMode,
      coachingWorkspace,
    }
  }, [input, formMode, coachingWorkspace])

  type RunGenOpts = { isTutorialRun?: boolean; skipWarmup?: boolean }

  const runGeneration = useCallback(
    async (opts?: RunGenOpts) => {
      if (!canGenerate) {
        setShowValidation(true)
        return
      }
      const isTutorialRun =
        opts?.isTutorialRun !== undefined
          ? opts.isTutorialRun
          : tutorialPhaseRef.current === 'spotlight_generate'
      const skipWarmup = opts?.skipWarmup === true

      const blocked =
        profileLoading ||
        !profile ||
        (!isTutorialRun && !canUseAiGeneration(profile))
      const usageCount = profile?.usage_count ?? null
      const isPro = profile ? hasPremiumAccess(profile) : null
      const remainingForLog =
        profile && !hasPremiumAccess(profile) ? freeGenerationsRemaining(profile) : Number.POSITIVE_INFINITY
      if (import.meta.env.DEV) {
        console.log('[usage]', { isPro, usageCount, remainingForLog, blocked, isTutorialRun })
      }

      if (blocked) {
        if (tutorialPhaseRef.current === 'off' && profile && !hasPremiumAccess(profile) && isFreeLimitReached(profile)) {
          let alreadyShown = false
          try {
            alreadyShown =
              typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_PAYWALL_SHOWN_KEY) === '1'
          } catch {
            alreadyShown = false
          }
          if (!alreadyShown) {
            setShowLimitPaywall(true)
            try {
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(SESSION_PAYWALL_SHOWN_KEY, '1')
              }
            } catch {
              // ignore storage errors
            }
          }
        }
        return
      }
      setShowValidation(false)
      setGenerationError(null)
      setOutputHelpfulness(null)

      let shouldShowWarmupTip = false
      if (!skipWarmup) {
        try {
          if (typeof sessionStorage !== 'undefined') {
            if (!sessionStorage.getItem(SESSION_WARMUP_TIP_KEY)) {
              sessionStorage.setItem(SESSION_WARMUP_TIP_KEY, '1')
              shouldShowWarmupTip = true
            }
          } else if (!warmupFallbackUsedRef.current) {
            warmupFallbackUsedRef.current = true
            shouldShowWarmupTip = true
          }
        } catch {
          if (!warmupFallbackUsedRef.current) {
            warmupFallbackUsedRef.current = true
            shouldShowWarmupTip = true
          }
        }
        if (shouldShowWarmupTip) setShowWarmupNotice(true)
      }

      setLoading(true)
      const startedAt = Date.now()
      setLogText(null)
      setLogSource(null)
      setLastGenerationMs(null)
      setCopiedSectionKeys({})
      try {
        const result = await requestCoachingLog(payload, { isTutorialRun })
        setLogText(result.text)
        setLogSource(result.source)
        setLastGenerationMs(Date.now() - startedAt)
        if (result.usage && !isTutorialRun) {
          applyUsageSnapshot({
            usageCount: result.usage.usageCount,
            isPro: result.usage.isPro,
          })
        }

        const generationSuccessful = typeof result.text === 'string' && result.text.trim().length > 0
        if (generationSuccessful && tutorialPhaseRef.current === 'spotlight_generate') {
          const ok = await completeTutorial()
          if (!ok) console.error('[tutorial] could not persist tutorial completion / bonus')
          setTutorialPhase('spotlight_output')
          triggerPostTutorialFeedbackNudge()
        }
        if (generationSuccessful && !isTutorialRun) {
          await refresh()
        }
      } catch (err) {
        if (err instanceof FreeLimitReachedError) {
          setShowLimitPaywall(true)
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(SESSION_PAYWALL_SHOWN_KEY, '1')
            }
          } catch {
            // ignore storage errors
          }
          return
        }
        if (err instanceof CoachingApiError) {
          setGenerationError(err.message || 'Could not generate right now. Please try again.')
          return
        }
        setGenerationError('Could not generate right now. Please try again.')
      } finally {
        setLoading(false)
        setShowWarmupNotice(false)
      }
    },
    [
      canGenerate,
      payload,
      profile,
      profileLoading,
      applyUsageSnapshot,
      completeTutorial,
      refresh,
      triggerPostTutorialFeedbackNudge,
      coachingWorkspace,
    ],
  )

  const generate = useCallback(() => void runGeneration(), [runGeneration])

  const regenerate = useCallback(() => {
    void runGeneration({ isTutorialRun: false, skipWarmup: true })
  }, [runGeneration])

  const copySection = useCallback(async (rowKey: string, sectionLabel: string, body: string) => {
    const plain = formatSectionClipboardBlock(sectionLabel, body)
    if (!plain) return

    const ok = await copyPlainTextToClipboard(plain)
    if (!ok) return

    setCopiedSectionKeys((m) => ({ ...m, [rowKey]: true }))
    window.setTimeout(() => {
      setCopiedSectionKeys((m) => ({ ...m, [rowKey]: false }))
    }, 1800)
  }, [])

  const parsedSections = useMemo(() => (logText ? parseCoachingLogMarkdown(logText) : []), [logText])

  const copyEntireForm = useCallback(async () => {
    if (!logText?.trim()) return
    const plain = formatCoachingFormForClipboard(parsedSections, logText)
    if (!plain.trim()) return
    const ok = await copyPlainTextToClipboard(plain)
    if (!ok) return
    setCopyEntireSuccess(true)
    window.setTimeout(() => setCopyEntireSuccess(false), 1600)
    setCopyFormToast(true)
    window.setTimeout(() => setCopyFormToast(false), 3200)
  }, [logText, parsedSections])

  const applySectionRefinement = useCallback(
    async (sectionId: CoachingFormSectionLabel, rowKey: string, currentBody: string) => {
      if (!logText?.trim()) return
      const preset = refinePresetPick
      const instruction = refineCustomText.trim()
      if (!preset && !instruction) {
        setGenerationError('Pick a quick refinement or add custom instructions.')
        return
      }
      setGenerationError(null)
      setRefiningRowKey(rowKey)
      try {
        const result = await requestRefineSection({
          sectionName: sectionId,
          sectionKey: sectionId,
          currentSectionText: currentBody,
          fullGeneratedForm: logText,
          refinementPreset: preset,
          refinementInstruction: instruction,
          mode: formMode,
          employeeName: input.employeeName,
          coachingFor: input.coachingReason,
          coachingWorkspace,
        })
        setLogText(mergeRefinedSectionIntoLog(logText, sectionId, result.refinedText))
        if (result.usage) {
          applyUsageSnapshot({
            usageCount: result.usage.usageCount,
            isPro: result.usage.isPro,
          })
        }
        if (result.refinementSnapshot) {
          applyRefinementSnapshot(result.refinementSnapshot)
        }
        setRefineOpenRowKey(null)
        setRefinePresetPick(null)
        setRefineCustomText('')
        setRefinedFlashKeys((m) => ({ ...m, [rowKey]: true }))
        window.setTimeout(() => {
          setRefinedFlashKeys((m) => {
            const next = { ...m }
            delete next[rowKey]
            return next
          })
        }, 2200)
      } catch (err) {
        if (err instanceof FreeLimitReachedError) {
          setShowLimitPaywall(true)
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(SESSION_PAYWALL_SHOWN_KEY, '1')
            }
          } catch {
            /* ignore */
          }
          return
        }
        if (err instanceof RefinementMonthlyLimitError) {
          setShowRefinementLimitModal(true)
          return
        }
        if (err instanceof RefinementRequiresProError) {
          setShowLimitPaywall(true)
          return
        }
        if (err instanceof CoachingApiError) {
          setGenerationError(err.message)
          return
        }
        setGenerationError('Could not refine this section. Please try again.')
      } finally {
        setRefiningRowKey(null)
      }
    },
    [
      logText,
      refinePresetPick,
      refineCustomText,
      formMode,
      input.employeeName,
      applyUsageSnapshot,
      applyRefinementSnapshot,
      coachingWorkspace,
    ],
  )

  const applyQuickTopicById = useCallback(
    (id: string) => {
      const opt = coachingTopicOptionById(coachingWorkspace, id)
      if (!opt) return
      setFormMode(opt.mode)
      setInput(opt.input)
      setShowValidation(false)
    },
    [coachingWorkspace],
  )

  const onQuickTopicChange = useCallback(
    (value: string) => {
      setQuickTopicSelection(value)
      if (!value) return
      applyQuickTopicById(value)
    },
    [applyQuickTopicById],
  )

  const invalidName = showValidation && !input.employeeName.trim()
  const invalidReason = showValidation && !input.coachingReason.trim()

  const workspaceGateOpen = Boolean(!profileLoading && profile?.needs_coaching_workspace_setup)

  const generationBlocked =
    profileLoading ||
    !profile ||
    workspaceGateOpen ||
    (!canUseAiGeneration(profile) && tutorialPhase !== 'spotlight_generate')
  const tutorialStep = TUTORIAL_STEPS[tutorialStepIndex]
  const tutorialHighlightQuickTopics = tutorialPhase === 'walkthrough' && tutorialStepIndex === 1
  const tutorialHighlightGenerate =
    tutorialPhase === 'spotlight_generate' || (tutorialPhase === 'walkthrough' && tutorialStepIndex === 2)
  return {
    profile,
    profileLoading,
    profileError,
    refresh,
    input,
    setInput,
    formMode,
    setFormMode,
    coachingWorkspace,
    quickTopicSelection,
    showValidation,
    generationError,
    logText,
    logSource,
    loading,
    lastGenerationMs,
    showLimitPaywall,
    setShowLimitPaywall,
    showRefinementLimitModal,
    setShowRefinementLimitModal,
    showPricingModal,
    setShowPricingModal,
    copiedSectionKeys,
    showWarmupNotice,
    tutorialPhase,
    tutorialStepIndex,
    generateBtnRef,
    outputCardRef,
    outputHelpfulness,
    setOutputHelpfulness,
    copyFormToast,
    copyEntireSuccess,
    refineOpenRowKey,
    setRefineOpenRowKey,
    refinePresetPick,
    setRefinePresetPick,
    refineCustomText,
    setRefineCustomText,
    refiningRowKey,
    refinedFlashKeys,
    tutorialDismissBusy,
    tutorialDismissError,
    selectCoachingWorkspace,
    workspaceUI,
    refinementQuota,
    dismissTutorialChrome,
    onTutorialStartGenerating,
    onTutorialNext,
    onTutorialBack,
    canGenerate,
    generate,
    regenerate,
    copySection,
    parsedSections,
    copyEntireForm,
    applySectionRefinement,
    onQuickTopicChange,
    invalidName,
    invalidReason,
    workspaceGateOpen,
    generationBlocked,
    tutorialStep,
    tutorialHighlightQuickTopics,
    tutorialHighlightGenerate,
  }
}
