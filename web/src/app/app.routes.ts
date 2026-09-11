import { Routes } from '@angular/router';

import { IssuerList } from './issuer-list/issuer-list';
import { IssuerDetail } from './issuer-detail/issuer-detail';
import { Statistics } from './statistics/statistics';

export const routes: Routes = [
  { path: '', component: IssuerList },
  { path: 'issuer/:isin', component: IssuerDetail },
  { path: 'statistics', component: Statistics },
  { path: '**', redirectTo: '' },
];
