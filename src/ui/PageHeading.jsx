import React from 'react';
import './primitives.css';
export default function PageHeading({title,eyebrow,description,actions,children,className=''}){
 return <header className={'ti-page-heading '+className}><div className="ti-page-heading__copy">{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<p className="ti-page-heading__description">{description}</p>}{children}</div>{actions&&<div className="ti-page-heading__actions">{actions}</div>}</header>;
}
