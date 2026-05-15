import type { SimpleCoachingInput } from '../types/coaching'

export const TUTORIAL_SAMPLE: SimpleCoachingInput = {
  employeeName: 'Alex Rivera',
  coachingReason: 'Late to opening shift twice this week',
  notes: 'Arrived 10+ minutes after start time.',
}

export type TutorialPhase = 'off' | 'walkthrough' | 'spotlight_generate' | 'spotlight_output'

export type TutorialStep = { title: string; body: string; support?: string }

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Create professional coaching forms in seconds',
    body: 'Start with the employee name and what the coaching conversation is about.',
  },
  {
    title: 'Move faster with quick topics',
    body: 'Pick a topic from the menu to pre-fill the form — then edit anything before you generate.',
  },
  {
    title: 'Generate your full form',
    body: 'Tap Generate and get a structured, ready-to-use coaching or recognition form.',
  },
  {
    title: 'Try it free',
    body: 'You get three free AI generations to see how Trackora fits your workflow — no commitment.',
  },
  {
    title: 'We’re listening',
    body: 'Something feel off? Tap Feedback anytime — we read every note and use it to improve.',
    support: 'Your feedback stays private to our team.',
  },
  {
    title: 'Unlock unlimited when you’re ready',
    body: 'Choose Pro or Elite for unlimited coaching forms; Elite adds unlimited refinements for teams that iterate often.',
  },
]
