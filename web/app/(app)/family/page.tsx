"use client";

import { useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { useProfile } from "@/components/providers/profile-provider";
import {
  useAllowance,
  useContribute,
  useCreateGoal,
  useFamilyDashboard,
  useGoals,
  useInviteMember,
  useMembers,
  useRemoveMember,
  useSpendLimits,
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
import { formatMinor } from "@/lib/money";
import type { ProfileRole } from "@/lib/api/types";

/**
 * Family — members, limits, allowance, goals, and the cross-profile view.
 *
 * The design's principle runs through all of it: limits nudge and inform, they
 * never block. An unrecorded expense is worse than a visible one, so nothing
 * on this page prevents a child logging something — it only makes it visible.
 */
export default function FamilyPage() {
  const { activeId, active } = useProfile();
  const members = useMembers(activeId);
  const limits = useSpendLimits(activeId);
  const allowance = useAllowance(activeId);
  const goals = useGoals(activeId);
  const household = useFamilyDashboard(active?.kind !== "CHILD");

  const [inviting, setInviting] = useState(false);
  const [addingGoal, setAddingGoal] = useState(false);

  const isChild = active?.kind === "CHILD";

  if (members.isPending) return <FamilySkeleton />;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink sm:text-[27px]">Family</h1>
        {!isChild && (
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" aria-hidden="true" />
            Invite
          </Button>
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
                 * server decides this per row — seeing that a teenager spent
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

              <Pill tone={member.role === "OWNER" ? "green" : "neutral"}>
                {member.role.toLowerCase()}
              </Pill>

              {!member.isYou && !isChild && (
                <RemoveMember memberId={member.id} name={member.email} />
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ---- allowance (child profiles) ---- */}
      {allowance.data?.allowance && (
        <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
          <Eyebrow>Allowance</Eyebrow>
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
        </section>
      )}

      {/* ---- spend limits ---- */}
      {limits.data?.overall && (
        <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
          <Eyebrow>Spend limit</Eyebrow>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <Amount value={limits.data.overall.status.spent} size="lg" />
            <span className="text-[13px] text-ink-muted">
              of {formatMinor(limits.data.overall.status.budget.amountMinor)}
            </span>
          </div>
          <Progress
            className="mt-3"
            value={limits.data.overall.status.usedPercent}
            label="Limit used"
          />
          <p className="mt-2 text-xs text-ink-faint">
            Limits are a nudge, never a block — going over is recorded and
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
            No goals yet — a bike, a trip, a rainy day.
          </p>
        ) : (
          <ul className="mt-3.5 flex flex-col gap-4">
            {goals.data!.map((view) => (
              <GoalRow key={view.goal.id} view={view} />
            ))}
          </ul>
        )}
      </section>

      <InviteModal open={inviting} onOpenChange={setInviting} />
      <GoalModal open={addingGoal} onOpenChange={setAddingGoal} />
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
  const [amount, setAmount] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

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
            ? "Reached — nice."
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
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            Add to this
          </Button>
        )}
      </div>
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
            { value: "ADULT", label: "Adult — full access" },
            { value: "CHILD", label: "Child — limited, with an allowance" },
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

function GoalModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { activeId } = useProfile();
  const create = useCreateGoal(activeId);
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [target, setTarget] = useState<number | null>(null);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New savings goal"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            isLoading={create.isPending}
            disabled={!name.trim() || !target}
            onClick={() => {
              if (!target) return;
              void create
                .mutateAsync({ name: name.trim(), targetMinor: target })
                .then(() => {
                  toast({ title: "Goal created", tone: "success" });
                  onOpenChange(false);
                  setName("");
                  setTarget(null);
                })
                .catch(() =>
                  toast({ title: "Couldn't create that goal", tone: "error" }),
                );
            }}
          >
            Create goal
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
      </div>
    </Modal>
  );
}
