// Local-only test proxy. It cannot be selected by a normal production build.
export default {server:{proxy:{'/api/members/manage':{target:'http://127.0.0.1:4189',headers:{origin:'https://triamicci-e2e.test'}}}}};
