import OnboardingSurvey from './bids/OnboardingSurvey';
import {saveOnboardingDraft} from './bids/onboarding-data.js';
import {writeSiteEntry} from './site-history.js';

// Legacy bookmarks enter the same onboarding flow as the public home.
export default function ServiceIntro() {
  return <OnboardingSurvey onLogin={draft=>writeSiteEntry('market','login',{entry:{onboardingDraft:saveOnboardingDraft(draft)}})} onContinue={draft=>{
    saveOnboardingDraft(draft);
    writeSiteEntry('market','signup',{entry:{customerSignup:{role:draft.role,legal:''},onboardingDraft:draft}});
  }}/>;
}
