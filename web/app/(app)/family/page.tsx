"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useProfile } from "@/components/providers/profile-provider";
import {
  useAllowance,
  useChangeRole,
  useContribute,
  useCreateGoal,
  useDeleteGoal,
  useUpdateGoal,
  useFamilyDashboard,
  useGoals,
  useInviteMember,
  useMembers,
  usePendingInvites,
  useRemoveMember,
  useRevokeInvite,
  useSpendLimits,
  type MemberView,
} from "@/lib/api/family";
import { Amount, Avatar, Eyebrow } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pill, Progress } from "@/components/ui/feedback";
import { FamilySkeleton } from "@/components/ui/skeletons";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import {
  useCreateProfile,
  useCreditAllowanceDue,
  useDeleteImpact,
  useDeleteProfile,
} from "@/lib/api/settings";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useRouter } from "next/navigation";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/cn";
import { SpendLimitsModal } from "@/components/family/spend-limits-modal";
import { AllowanceModal } from "@/components/family/allowance-modal";
import type { ProfileRole } from "@/lib/api/types";

/**
 * Family - members, limits, allowance, goals, and the cross-profile view.
 *
 * The design's principle runs through all of it: limits nudge and inform, they
 * never block. An unrecorded expense is worse than a visible one, so nothing
 * on this page prevents a child logging something - it only makes it visible.
 */
export default function FamilyPage() {
  const { activeId, active } = useProfile();
  const members = useMembers(activeId);
  const limits = useSpendLimits(activeId);
  const [editingLimits, setEditingLimits] = useState(false);
  const [editingAllowance, setEditingAllowance] = useState(false);
  const allowance = useAllowance(activeId);
  const goals = useGoals(activeId);
  const household = useFamilyDashboard(active?.kind !== "CHILD");

  const [inviting, setInviting] = useState(false);
  const [addingGoal, setAddingGoal] = useState(false);
  const [addingProfile, setAddingProfile] = useState(false);

  const isChild = active?.kind === "CHILD";

  if (members.isPending) return <FamilySkeleton />;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink sm:text-[27px]">Family</h1>
        {!isChild && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddingProfile(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              New profile
            </Button>
            <Button size="sm" onClick={() => setInviting(true)}>
              <UserPlus className="size-4" aria-hidden="true" />
              Invite
            </Button>
          </div>
        )}
      </div>

      {/* ---- household roll-up ---- */}
      {household.data && household.data.members.length > 1 && (
        <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
          <Eyebrow>The household this month</Eyebrow>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Amount value={household.data.householdSpent} size="lg" />
            <span className="text-[13px] text-ink-muted">
              spent across {household.data.members.length} profiles
            </span>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {household.data.members.map((member) => (
              <li key={member.profileId} className="flex items-center gap-3">
                <Avatar
                  initials={member.initials}
                  color={member.avatarColor}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm text-ink">
                    {member.name}
                    {member.kind === "CHILD" && <Pill>Limited</Pill>}
                  </p>
                  {member.allowanceRemaining && (
                    <p className="text-xs text-ink-faint">
                      {formatMinor(member.allowanceRemaining.amountMinor)}{" "}
                      allowance left
                    </p>
                  )}
                </div>

                {/*
                 * A member whose detail is hidden still shows a total. The
                 * server decides this per row - seeing that a teenager spent
                 * ₹2,000 without seeing on what is the design's whole
                 * "without surveillance" claim.
                 */}
                <Amount value={member.spent} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- members ---- */}
      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <Eyebrow>Who&rsquo;s on this profile</Eyebrow>

        <ul className="mt-3 flex flex-col gap-3">
          {(members.data ?? []).map((member) => (
            <li key={member.id} className="flex items-center gap-3">
              <Avatar
                initials={(member.name ?? member.email).slice(0, 2).toUpperCase()}
                color="#1F6F5C"
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  {member.name ?? member.email}
                  {member.isYou && (
                    <span className="text-ink-faint"> · you</span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-faint">{member.email}</p>
              </div>

              {/* Your own role is shown, never edited - demoting yourself out
                  of the profile you are administering is a trap, and the
                  server refuses the last owner anyway. */}
              {member.isYou || isChild ? (
                <Pill tone={member.role === "OWNER" ? "green" : "neutral"}>
                  {member.role.toLowerCase()}
                </Pill>
              ) : (
                <MemberRole member={member} />
              )}

              {!member.isYou && !isChild && (
                <RemoveMember memberId={member.id} name={member.email} />
              )}
            </li>
          ))}
        </ul>

        <PendingInvites />
      </section>

      {/* ---- allowance ---- */}
      {!isChild && (
        <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>Allowance</Eyebrow>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingAllowance(true)}
            >
              {allowance.data?.allowance ? "Change" : "Set an allowance"}
            </Button>
          </div>

          {!allowance.data?.allowance && (
            <p className="mt-2 text-sm text-ink-muted">
              No allowance yet. A monthly amount is credited automatically and
              spending is tracked against it.
            </p>
          )}

          {allowance.data?.allowance && (
          <>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <Amount value={allowance.data.remaining} size="lg" />
            <span className="text-[13px] text-ink-muted">
              left of {formatMinor(allowance.data.credited.amountMinor)} this
              month
            </span>
          </div>
          <Progress
            className="mt-3"
            value={allowance.data.spent.amountMinor}
            max={Math.max(1, allowance.data.credited.amountMinor)}
            label="Allowance used"
          />

          <CreditAllowance />
          </>
          )}
        </section>
      )}

      {/* ---- spend limits ---- */}
      {!isChild && (
        <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>Spend limits</Eyebrow>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingLimits(true)}
            >
              {limits.data?.overall ? "Change" : "Set a limit"}
            </Button>
          </div>

          {limits.data?.overall ? (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <Amount value={limits.data.overall.status.spent} size="lg" />
                <span className="text-[13px] text-ink-muted">
                  of{" "}
                  {formatMinor(
                    limits.data.overall.status.budget.amountMinor,
                  )}
                </span>
              </div>
              <Progress
                className="mt-3"
                value={limits.data.overall.status.usedPercent}
                label="Limit used"
              />
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">
              No limit set. A monthly ceiling flags overspending without ever
              refusing it.
            </p>
          )}

          {/* Per-category lines, once any are set. */}
          {(limits.data?.categories.length ?? 0) > 0 && (
            <ul className="mt-4 flex flex-col gap-3">
              {limits.data!.categories.map((line) => (
                <li key={line.categoryId ?? "all"}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-ink">
                      {line.categoryName}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[13px] tabular-nums",
                        line.status.isOver
                          ? "text-spend"
                          : line.status.isApproaching
                            ? "text-attention-ink"
                            : "text-ink-muted",
                      )}
                    >
                      {formatMinor(line.status.spent.amountMinor)} of{" "}
                      {formatMinor(line.status.budget.amountMinor)}
                    </span>
                  </div>
                  <Progress
                    className="mt-1.5"
                    value={line.status.usedPercent}
                    label={`${line.categoryName} limit used`}
                  />
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-ink-faint">
            Limits are a nudge, never a block - going over is recorded and
            flagged, never refused.
          </p>
        </section>
      )}

      {/* ---- goals ---- */}
      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <div className="flex items-center justify-between">
          <Eyebrow>Savings goals</Eyebrow>
          <Button variant="ghost" size="sm" onClick={() => setAddingGoal(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            New goal
          </Button>
        </div>

        {(goals.data?.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No goals yet - a bike, a trip, a rainy day.
          </p>
        ) : (
          <ul className="mt-3.5 flex flex-col gap-4">
            {goals.data!.map((view) => (
              <GoalRow key={view.goal.id} view={view} />
            ))}
          </ul>
        )}
      </section>

      {!isChild && <DeleteProfile />}

      <InviteModal open={inviting} onOpenChange={setInviting} />
      <GoalModal open={addingGoal} onOpenChange={setAddingGoal} />
      <AddProfileModal open={addingProfile} onOpenChange={setAddingProfile} />
      <AllowanceModal
        open={editingAllowance}
        onOpenChange={setEditingAllowance}
        current={allowance.data}
      />
      <SpendLimitsModal
        open={editingLimits}
        onOpenChange={setEditingLimits}
        current={limits.data}
      />
    </div>
  );
}

function RemoveMember({ memberId, name }: { memberId: string; name: string }) {
  const { activeId } = useProfile();
  const remove = useRemoveMember(activeId);
  const { toast } = useToast();

  return (
    <Button
      variant="ghost"
      size="sm"
      isLoading={remove.isPending}
      onClick={() => {
        void remove
          .mutateAsync(memberId)
          .then(() => toast({ title: `${name} removed`, tone: "info" }))
          .catch((error: unknown) =>
            toast({
              title: "Couldn't remove them",
              description:
                error instanceof ApiError ? error.displayMessage : undefined,
              tone: "error",
            }),
          );
      }}
    >
      Remove
    </Button>
  );
}

function GoalRow({ view }: { view: ReturnType<typeof useGoals>["data"] extends
  | (infer T)[]
  | undefined
  ? T
  : never }) {
  const { activeId } = useProfile();
  const contribute = useContribute(activeId);
  const remove = useDeleteGoal(activeId);
  const { toast } = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{view.goal.name}</span>
        <span className="text-[13px] text-ink-muted">
          {formatMinor(view.saved.amountMinor)} of{" "}
          {formatMinor(view.target.amountMinor)}
        </span>
      </div>

      <Progress
        className="mt-2"
        value={view.percentComplete}
        tone={view.isAchieved ? "green" : undefined}
      />

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">
          {view.isAchieved
            ? "Reached - nice."
            : view.perMonthToHitTarget
              ? `${formatMinor(view.perMonthToHitTarget.amountMinor)} a month to hit the date`
              : `${formatMinor(view.remaining.amountMinor)} to go`}
        </p>

        {adding ? (
          <div className="flex items-end gap-2">
            <AmountInput
              valueMinor={amount}
              onValueChange={setAmount}
              label=""
              className="w-28"
            />
            <Button
              size="sm"
              isLoading={contribute.isPending}
              disabled={!amount}
              onClick={() => {
                if (!amount) return;
                void contribute
                  .mutateAsync({ goalId: view.goal.id, amountMinor: amount })
                  .then(() => {
                    setAmount(null);
                    setAdding(false);
                  });
              }}
            >
              Add
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              Add to this
            </Button>

            {/* A goal you cannot edit is one you delete and rebuild - losing
                every contribution recorded against it. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${view.goal.name}`}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="text-spend hover:bg-spend/10"
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Delete ${view.goal.name}`}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      <GoalModal open={editing} onOpenChange={setEditing} goal={view.goal} />

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${view.goal.name}?`}
        description="The goal and everything saved towards it go with it. Money already spent stays in the ledger."
        confirmLabel="Delete goal"
        destructive
        onConfirm={() => {
          void remove
            .mutateAsync(view.goal.id)
            .then(() => toast({ title: "Goal deleted", tone: "info" }))
            .catch(() =>
              toast({ title: "Couldn't delete that goal", tone: "error" }),
            );
        }}
      />
    </li>
  );
}

function InviteModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { activeId } = useProfile();
  const invite = useInviteMember(activeId);
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProfileRole>("ADULT");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Invite someone"
      description="They'll get a link. It only works for this address."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            isLoading={invite.isPending}
            disabled={!email.trim()}
            onClick={() => {
              void invite
                .mutateAsync({ email: email.trim(), role })
                .then(() => {
                  toast({ title: `Invite sent to ${email}`, tone: "success" });
                  onOpenChange(false);
                  setEmail("");
                })
                .catch((error: unknown) =>
                  toast({
                    title: "Couldn't send that invite",
                    description:
                      error instanceof ApiError
                        ? error.displayMessage
                        : undefined,
                    tone: "error",
                  }),
                );
            }}
          >
            Send invite
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          placeholder="meera@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select
          label="Role"
          value={role}
          onValueChange={(value) => setRole(value as ProfileRole)}
          options={[
            { value: "ADULT", label: "Adult - full access" },
            { value: "CHILD", label: "Child - limited, with an allowance" },
          ]}
        />
        <p className="text-xs leading-relaxed text-ink-faint">
          A child profile can log expenses and see its own allowance and goals,
          but not the household&rsquo;s cards or balances.
        </p>
      </div>
    </Modal>
  );
}

/** Creates a goal, or edits one - the same three fields either way. */
function GoalModal({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  goal?: { id: string; name: string; targetMinor: number; targetDate: string | null };
}) {
  const { activeId } = useProfile();
  const create = useCreateGoal(activeId);
  const update = useUpdateGoal(activeId);
  const { toast } = useToast();

  const editing = Boolean(goal);

  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState<number | null>(goal?.targetMinor ?? null);
  const [targetDate, setTargetDate] = useState(goal?.targetDate?.slice(0, 10) ?? "");

  const pending = create.isPending || update.isPending;

  function submit() {
    if (!target) return;

    const body = {
      name: name.trim(),
      targetMinor: target,
      // Cleared explicitly rather than omitted, so removing a date actually
      // removes it instead of leaving the old one in place.
      targetDate: targetDate || null,
    };

    const action = goal
      ? update.mutateAsync({ goalId: goal.id, patch: body })
      : create.mutateAsync({ ...body, targetDate: targetDate || undefined });

    void action
      .then(() => {
        toast({
          title: editing ? "Goal updated" : "Goal created",
          tone: "success",
        });
        onOpenChange(false);
        if (!editing) {
          setName("");
          setTarget(null);
          setTargetDate("");
        }
      })
      .catch((error: unknown) =>
        toast({
          title: editing
            ? "Couldn't update that goal"
            : "Couldn't create that goal",
          description:
            error instanceof ApiError ? error.displayMessage : undefined,
          tone: "error",
        }),
      );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit goal" : "New savings goal"}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            isLoading={pending}
            disabled={!name.trim() || !target}
            onClick={submit}
          >
            {editing ? "Save changes" : "Create goal"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="What for?"
          placeholder="New cycle"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <AmountInput
          label="Target"
          valueMinor={target}
          onValueChange={setTarget}
        />
        <Input
          label="By when"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          hint="Optional - with a date, we work out what to put aside each month"
        />
      </div>
    </Modal>
  );
}

/**
 * Credits an allowance that is due but not yet paid in.
 *
 * The nightly job normally does this. The button exists for the gap between
 * the due day and that run - and it is safe to press twice, because the
 * server guards on lastCreditedMonth and a second call in the same month is
 * a no-op.
 */
/**
 * Changes a member's role in place.
 *
 * The role was a read-only pill, so the only way to promote someone was to
 * remove and re-invite them - which loses their history on the profile. The
 * server refuses to demote the last owner, and that refusal surfaces as a
 * toast rather than a silent no-op.
 */
function MemberRole({ member }: { member: MemberView }) {
  const { activeId } = useProfile();
  const change = useChangeRole(activeId);
  const { toast } = useToast();

  return (
    <Select
      className="w-28"
      aria-label={`Role for ${member.email}`}
      value={member.role}
      onValueChange={(value) => {
        void change
          .mutateAsync({ memberId: member.id, role: value as ProfileRole })
          .then(() => toast({ title: "Role updated", tone: "success" }))
          .catch((error: unknown) =>
            toast({
              title: "Couldn't change that role",
              description:
                error instanceof ApiError ? error.displayMessage : undefined,
              tone: "error",
            }),
          );
      }}
      options={[
        { value: "OWNER", label: "Owner" },
        { value: "ADULT", label: "Adult" },
        { value: "CHILD", label: "Child" },
      ]}
    />
  );
}

/**
 * Invitations sent but not yet accepted.
 *
 * Inviting used to be fire-and-forget: no way to see who had been asked, no
 * way to tell an expired invite from an ignored one, and no way to take back
 * an invite sent to the wrong address short of asking them not to click it.
 */
function PendingInvites() {
  const { activeId } = useProfile();
  const invites = usePendingInvites(activeId);
  const revoke = useRevokeInvite(activeId);
  const { toast } = useToast();

  if ((invites.data?.length ?? 0) === 0) return null;

  return (
    <div className="mt-5 border-t border-line pt-4">
      <Eyebrow>Invited, not yet joined</Eyebrow>

      <ul className="mt-2.5 flex flex-col gap-2.5">
        {invites.data!.map((invite) => {
          const expired = new Date(invite.expiresAt) < new Date();

          return (
            <li key={invite.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{invite.email}</p>
                <p className="truncate text-xs text-ink-faint">
                  {invite.role.toLowerCase()} ·{" "}
                  {expired
                    ? "expired"
                    : `expires ${new Date(invite.expiresAt).toLocaleDateString(
                        "en-IN",
                        { day: "numeric", month: "short" },
                      )}`}
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-spend hover:bg-spend/10"
                onClick={() => {
                  void revoke
                    .mutateAsync(invite.id)
                    .then(() =>
                      toast({ title: "Invitation withdrawn", tone: "info" }),
                    )
                    .catch(() =>
                      toast({ title: "Couldn't withdraw it", tone: "error" }),
                    );
                }}
              >
                Withdraw
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CreditAllowance() {
  const { activeId } = useProfile();
  const credit = useCreditAllowanceDue(activeId);
  const { toast } = useToast();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="mt-3"
      isLoading={credit.isPending}
      onClick={() => {
        void credit
          .mutateAsync()
          .then(() => toast({ title: "Allowance up to date", tone: "success" }))
          .catch((error: unknown) =>
            toast({
              title: "Couldn't credit that",
              description:
                error instanceof ApiError ? error.displayMessage : undefined,
              tone: "error",
            }),
          );
      }}
    >
      Credit what&rsquo;s due
    </Button>
  );
}

function AddProfileModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateProfile();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"PERSONAL" | "SHARED" | "CHILD">("SHARED");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New profile"
      description="A separate ledger - a household, a side business, a child."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            isLoading={create.isPending}
            disabled={!name.trim()}
            onClick={() => {
              void create
                .mutateAsync({ name: name.trim(), kind })
                .then(() => {
                  toast({ title: `${name.trim()} created`, tone: "success" });
                  onOpenChange(false);
                  setName("");
                })
                .catch((error: unknown) =>
                  toast({
                    title: "Couldn't create that profile",
                    description:
                      error instanceof ApiError
                        ? error.displayMessage
                        : undefined,
                    tone: "error",
                  }),
                );
            }}
          >
            Create profile
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          placeholder="Sharma family"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          label="Kind"
          value={kind}
          onValueChange={(value) =>
            setKind(value as "PERSONAL" | "SHARED" | "CHILD")
          }
          options={[
            { value: "SHARED", label: "Shared - a household" },
            { value: "PERSONAL", label: "Personal - just you" },
            { value: "CHILD", label: "Child - limited, with an allowance" },
          ]}
        />
      </div>
    </Modal>
  );
}

/**
 * Deleting a profile, with its impact shown first.
 *
 * The server refuses to remove someone's last profile, and it counts what
 * would go - accounts, transactions, pending reviews. Showing those numbers
 * is the difference between a confirmation and a formality.
 */
function DeleteProfile() {
  const router = useRouter();
  const { activeId, active, profiles } = useProfile();
  const impact = useDeleteImpact(activeId);
  const remove = useDeleteProfile();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  if (!active || profiles.length < 2) return null;

  const data = impact.data;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-spend hover:bg-spend/10"
        onClick={() => setConfirming(true)}
      >
        Delete this profile
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${active.name}?`}
        description={
          data
            ? data.deletable
              ? `${data.accounts} accounts, ${data.transactions} transactions and ${data.reviewItems} pending entries go with it. This cannot be undone.`
              : (data.reason ?? "This profile cannot be deleted.")
            : "Checking what this would remove…"
        }
        confirmLabel="Delete profile"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (!data?.deletable) return;
          void remove
            .mutateAsync(active.id)
            .then(() => {
              toast({ title: `${active.name} deleted`, tone: "info" });
              setConfirming(false);
              router.push("/dashboard");
            })
            .catch((error: unknown) =>
              toast({
                title: "Couldn't delete that profile",
                description:
                  error instanceof ApiError ? error.displayMessage : undefined,
                tone: "error",
              }),
            );
        }}
      />
    </>
  );
}
