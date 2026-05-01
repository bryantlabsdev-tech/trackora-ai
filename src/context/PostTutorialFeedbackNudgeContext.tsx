import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const NUDGE_MS = 4200

type PostTutorialFeedbackNudgeContextValue = {
  feedbackNudgeActive: boolean
  triggerPostTutorialFeedbackNudge: () => void
}

const PostTutorialFeedbackNudgeContext = createContext<PostTutorialFeedbackNudgeContextValue | null>(
  null,
)

export function PostTutorialFeedbackNudgeProvider({ children }: { children: ReactNode }) {
  const [feedbackNudgeActive, setFeedbackNudgeActive] = useState(false)

  useEffect(() => {
    if (!feedbackNudgeActive) return
    const id = window.setTimeout(() => setFeedbackNudgeActive(false), NUDGE_MS)
    return () => window.clearTimeout(id)
  }, [feedbackNudgeActive])

  const triggerPostTutorialFeedbackNudge = useCallback(() => {
    setFeedbackNudgeActive(true)
  }, [])

  const value = useMemo(
    () => ({ feedbackNudgeActive, triggerPostTutorialFeedbackNudge }),
    [feedbackNudgeActive, triggerPostTutorialFeedbackNudge],
  )

  return (
    <PostTutorialFeedbackNudgeContext.Provider value={value}>{children}</PostTutorialFeedbackNudgeContext.Provider>
  )
}

export function usePostTutorialFeedbackNudge(): PostTutorialFeedbackNudgeContextValue {
  const ctx = useContext(PostTutorialFeedbackNudgeContext)
  if (!ctx) {
    throw new Error('usePostTutorialFeedbackNudge must be used within PostTutorialFeedbackNudgeProvider')
  }
  return ctx
}
