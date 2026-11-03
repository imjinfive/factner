import {emptyOnboardingDraft,normalizeOnboardingDraft,surveySteps} from './onboarding-data.js';

export function restoreSurveyEntry(saved,fallback=emptyOnboardingDraft()){
 const draft=normalizeOnboardingDraft(saved?.draft||fallback);
 return {draft,step:surveySteps(draft).includes(saved?.step)?saved.step:'role',index:Number.isInteger(saved?.index)&&saved.index>=0?saved.index:0};
}
