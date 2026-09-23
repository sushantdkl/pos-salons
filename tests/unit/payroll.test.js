import test from 'node:test';
import assert from 'node:assert/strict';
import { planSettlement } from '../../src/lib/payroll/salary-advances.js';

test('advance recovery cannot exceed payable and carries excess forward',()=>{
  assert.deepEqual(planSettlement(30000,8000),{grossPayable:30000,outstandingAdvance:8000,advanceApplied:8000,remainingPayable:22000,advanceCarriedForward:0});
  assert.deepEqual(planSettlement(5000,8000),{grossPayable:5000,outstandingAdvance:8000,advanceApplied:5000,remainingPayable:0,advanceCarriedForward:3000});
});
