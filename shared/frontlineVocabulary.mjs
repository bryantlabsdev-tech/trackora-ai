const FRONTLINE_REPLACEMENTS = [
  [/\btaking too long between postpaid activations\b/gi, 'not creating enough postpaid output for hours worked'],
  [/\btaking too long between activations\b/gi, 'not creating enough postpaid opportunities during the shift'],
  [/\bbetween postpaid activations\b/gi, 'across hours worked'],
  [/\bqualifying leads effectively\b/gi, 'asking stronger discovery questions and creating better conversations'],
  [/\bqualifying customers better\b/gi, 'asking stronger discovery questions to uncover upgrades and new-line opportunities'],
  [/\bserve customers better\b/gi, 'engage more customers and create more postpaid conversations'],
  [/\bmake the most of our time on the floor\b/gi, 'keep urgency high and stay active with traffic'],
  [/\btrack your APS regularly\b/gi, 'keep working all carrier options consistent each shift'],
  [/\bmonitor your APS\b/gi, 'stay consistent working all carrier options during traffic'],
  [/\bcustomer service improvement\b/gi, 'consistent customer engagement and opportunity creation'],
  [/\btrack attempts\b/gi, 'fully work each customer interaction before moving on'],
  [/\bincrease your attempts\b/gi, 'engage more customers and fully work each interaction'],
  [/\bincrease engagement only\b/gi, 'engage more customers consistently during traffic'],
  [/\bincrease attempts\b/gi, 'engage more customers and fully work each interaction'],
  [/\btarget at least 3\.5 APS\b/gi, 'uncover more upgrade and new-line opportunities'],
  [/\btarget APS\b/gi, 'uncover more opportunities with customers'],
  [/\bAPS goal\b/gi, ''],
  [/\bmaximize traffic opportunities\b/gi, 'uncover more opportunities with customers'],
  [/\bmaximize traffic\b/gi, 'slow down and uncover more opportunities with customers'],
  [/\ball available carriers\b/gi, 'all carrier options'],
  [/\bcarrier eligibility\b/gi, 'carrier options'],
  [/\bcheck eligibility\b/gi, 'uncover customer needs and carrier paths'],
  [/\bfocus on eligibility checks\b/gi, 'work all carrier options before ending conversations'],
  [/\btablet eligibility\b/gi, 'all carrier options'],
  [/\bget(?:ting)? customers to the tablet\b/gi, 'run customers on all available carriers when possible'],
  [/\bfocus on tablet eligibility\b/gi, 'focus on checking carrier opportunities during interactions'],
  [/\buse the tablet for eligibility\b/gi, 'check all carrier options before ending interactions'],
  [/\blead qualification\b/gi, 'discovery and opportunity finding'],
  [/\bqualification\b/gi, 'discovery'],
  [/\bstreamline your activation process\b/gi, 'tighten your customer flow and reset faster between interactions'],
  [/\bstreamline operations\b/gi, 'keep floor execution clean and consistent'],
  [/\bactivation workflow optimization\b/gi, 'better floor execution during customer interactions'],
  [/\bworkflow optimization\b/gi, 'cleaner floor execution'],
  [/\boptimi[sz]e activation process\b/gi, 'tighten customer flow and reduce downtime on the floor'],
  [/\bprocess efficiency\b/gi, 'execution pace on the floor'],
  [/\bworkflow\/process efficiency\b/gi, 'execution pace on the floor'],
  [/\bstreamline your process\b/gi, 'tighten floor execution and reduce downtime'],
  [/\bstreamlin(?:e|ing) activations?\b/gi, 'tighten customer flow and reduce downtime between interactions'],
  [/\bimprov(?:e|ing) productivity\b/gi, 'create more opportunities and keep urgency high'],
  [/\bimprov(?:e|ing) (?:your )?conversion habits\b/gi, 'turn more customer conversations into postpaid opportunities'],
  [/\brefining your closing techniques\b/gi, 'asking for the sale with more confidence in each conversation'],
  [/\boverall productivity on the floor\b/gi, 'overall floor momentum and postpaid output'],
  [/\btrack your activations more closely\b/gi, 'track postpaid conversations and activations each shift'],
  [/\btrack your activation flow\b/gi, 'track transaction pace and reset speed through the shift'],
  [/\bactivation flow\b/gi, 'transaction pace on the floor'],
  [/\bclosing sales\b/gi, 'turning more customer conversations into postpaid opportunities'],
  [/\bsuccessful activations?\b/gi, 'postpaid activations'],
  [/\bworkflow\b/gi, 'floor execution'],
  [/\bimprove productivity efficiency\b/gi, 'create more opportunities with stronger urgency'],
  [/\bimprove productivity metrics\b/gi, 'create more customer conversations and postpaid opportunities'],
  [/\boperational excellence\b/gi, 'consistent floor execution'],
]

/**
 * Replace corporate/consultant wording with frontline wireless language.
 * @param {string} text
 * @returns {string}
 */
export function normalizeFrontlineVocabulary(text) {
  let out = String(text ?? '')
  for (const [pattern, replacement] of FRONTLINE_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

