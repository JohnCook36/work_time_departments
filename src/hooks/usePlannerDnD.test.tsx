import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Department, Employee } from '../types';
import { usePlannerDnD } from './usePlannerDnD';

function useHarness() {
  const React = require('react') as typeof import('react');
  const [departments, setDepartments] = React.useState<Department[]>([
    { id: 'a', name: 'A', kind: 'general' },
    { id: 'b', name: 'B', kind: 'general' },
  ]);
  const [employees, setEmployees] = React.useState<Employee[]>([
    { id: 'e1', name: 'One', departmentId: 'a' },
    { id: 'e2', name: 'Two', departmentId: 'b' },
  ]);

  const dnd = usePlannerDnD({
    employees,
    departments,
    setEmployees,
    setDepartments,
    serverPlannerReadEnabled: false,
    serverPlannerWriteEnabled: false,
    serverPlannerStatus: 'disabled',
    serverEmployeeMetadata: {},
    serverDepartmentMetadata: {},
    isSuperAdmin: true,
    refreshServerPlanner: vi.fn().mockResolvedValue(undefined),
  });

  return {
    ...dnd,
    departments,
    employees,
  };
}

describe('usePlannerDnD local orchestration', () => {
  it('reorders departments without transport details in the component', () => {
    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'dept:a' },
        over: { id: 'dept:b' },
      } as never);
    });

    expect(result.current.departments.map((department) => department.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('moves an employee into the target department and preserves target ordering', () => {
    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'emp:e1' },
        over: { id: 'emp:e2' },
      } as never);
    });

    expect(result.current.employees.map((employee) => ({
      id: employee.id,
      departmentId: employee.departmentId,
    }))).toEqual([
      { id: 'e1', departmentId: 'b' },
      { id: 'e2', departmentId: 'b' },
    ]);
  });

  it('tracks the current employee drop target for UI highlighting', () => {
    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.handleDragStart({
        active: { id: 'emp:e1' },
      } as never);
      result.current.handleDragOver({
        active: { id: 'emp:e1' },
        over: { id: 'dep:b' },
      } as never);
    });

    expect(result.current.activeDragId).toBe('emp:e1');
    expect(result.current.dragTargetDepartmentId).toBe('b');
  });
});
