import {sessionAuth as auth} from './firebase.js';
import {apiFetch} from './api-fetch.js';
import {createJsonClient} from './json-client.js';
export const requestJson=createJsonClient({getUser:()=>auth.currentUser,fetcher:(...args)=>apiFetch(...args)});
