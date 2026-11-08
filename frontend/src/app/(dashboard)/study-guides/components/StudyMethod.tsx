'use client'

import { useTranslation } from '@/lib/hooks/use-translation'
import { STRATEGY_LABELS } from '@/lib/utils/study-guide-labels'

export const STRATEGIES = [
  'retrieval',
  'spacing',
  'interleaving',
  'elaboration',
  'selfExplanation',
  'concreteExamples',
  'dualCoding',
  'pretesting',
  'metacognition',
] as const

// Citations stay in their original language.
const REFERENCES = [
  'Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students’ learning with effective learning techniques. Psychological Science in the Public Interest, 14(1), 4–58.',
  'Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. Psychological Science, 17(3), 249–255.',
  'Adesope, O. O., Trevisan, D. A., & Sundararajan, N. (2017). Rethinking the use of tests: A meta-analysis of practice testing. Review of Educational Research, 87(3), 659–701.',
  'Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. Psychological Science, 19(11), 1095–1102.',
  'Rawson, K. A., Dunlosky, J., & Sciartelli, S. M. (2013). The power of successive relearning. Educational Psychology Review, 25(4), 523–548.',
  'Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. Psychological Bulletin, 145(11), 1029–1052.',
  'Bisra, K., Liu, Q., Nesbit, J. C., Salimi, F., & Winne, P. H. (2018). Inducing self-explanation: A meta-analysis. Educational Psychology Review, 30(3), 703–725.',
  'Weinstein, Y., Madan, C. R., & Sumeracki, M. A. (2018). Teaching the science of learning. Cognitive Research: Principles and Implications, 3, 2.',
  'Richland, L. E., Kornell, N., & Kao, L. S. (2009). The pretesting effect: Do unsuccessful retrieval attempts enhance learning? Journal of Experimental Psychology: Applied, 15(3), 243–257.',
  'Mayer, R. E. (2009). Multimedia learning (2nd ed.). Cambridge University Press.',
]

export function StudyMethod() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm text-muted-foreground">{t('studyGuides.methodIntro')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {STRATEGIES.map((key) => (
          <article key={key} className="rounded-2xl border bg-card p-4 space-y-2">
            <h3 className="font-medium">{t(STRATEGY_LABELS[key].name)}</h3>
            <p className="text-sm">{t(STRATEGY_LABELS[key].what)}</p>
            <p className="text-sm text-muted-foreground">{t(STRATEGY_LABELS[key].evidence)}</p>
            <p className="text-sm text-teal">{t(STRATEGY_LABELS[key].inPlan)}</p>
          </article>
        ))}
      </div>
      <section className="rounded-2xl border border-dashed p-4 space-y-2">
        <h3 className="font-medium">{t('studyGuides.lowUtilityTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('studyGuides.lowUtilityDesc')}</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">{t('studyGuides.references')}</h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {REFERENCES.map((ref) => (
            <li key={ref}>{ref}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
