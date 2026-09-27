import { api, state, canReviewApplications, isLead, isAdvisor } from './api';

/** Resolve all accessible tab datasets while the plain loading screen is visible. */
export async function preloadWorkspace(extra:Array<Promise<unknown>>=[]){
 const userId=state.me?.user_id;
 const work:Array<Promise<unknown>>=[api.members().then(members=>{if(state.me?.user_id===userId)state.members=members;}),api.tasks(),api.workingRoles(),api.workingRoleAssignments(),...extra];
 if(!isAdvisor())work.push(api.meetings(),api.rsvps());
 if(canReviewApplications())work.push(api.review('list'));
 if(isLead())work.push(api.membershipRequests());
 return Promise.allSettled(work);
}
