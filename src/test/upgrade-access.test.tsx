import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
const mocks = vi.hoisted(() => ({navigate:vi.fn(),toast:vi.fn()}));
vi.mock("react-router-dom",()=>({useNavigate:()=>mocks.navigate}));
vi.mock("sonner",()=>({toast:mocks.toast}));
vi.mock("@/lib/upgrade-events",()=>({trackUpgrade:vi.fn()}));
import { AccessNotice } from "@/components/AccessNotice";
import { handleQuotaError } from "@/lib/quota-error-handler";
import {setRetourScope,memoriseRetour,lireRetour,oublieRetour} from "@/lib/retour-apres-detour";
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();localStorage.clear();setRetourScope(null,null);});
describe("business limits remain distinct from outages",()=>{
 it("free Studio has an explicit Premium action, never a pack",()=>{
  render(<AccessNotice quota={{allowed:true,plan:"free"}} premiumBlocked onRetry={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:"Découvrir Premium"}));
  expect(mocks.navigate).toHaveBeenCalledWith("/pricing");
  expect(screen.queryByText("Ajouter des crédits")).toBeNull();
 });
 it("failed rights offer only a retry",()=>{
  const retry=vi.fn();render(<AccessNotice quota={{allowed:false,plan:"unknown",reason:"error"}} premiumBlocked onRetry={retry}/>);
  expect(screen.queryByRole("button",{name:"Découvrir Premium"})).toBeNull();
  fireEvent.click(screen.getByText("Réessayer la vérification"));expect(retry).toHaveBeenCalledOnce();
 });
 it("paid hard caps and insufficient series never offer unusable packs",()=>{
  render(<AccessNotice quota={{allowed:false,plan:"outil",reason:"category",category:"photo_retouch"}} onRetry={()=>{}}/>);
  expect(screen.queryByText("Ajouter des crédits")).toBeNull();
  expect(screen.getByText(/Les packs de crédits n’augmentent/)).toBeTruthy();
 });
 it("provider quota/rate-limit and rights errors never become sales prompts",()=>{
  for(const e of [{message:"Provider quota reached",isRateLimit:true},{data:{error:"limit_reached",quota:{reason:"error"}}},{message:"Plus de crédits fournisseur"}]) expect(handleQuotaError(e)).toBe(false);
  expect(mocks.toast).not.toHaveBeenCalled();
 });
});
describe("return continuity",()=>{
 it("survives a new tab for the same account and isolates another account",()=>{
  setRetourScope("a","workspace-a");memoriseRetour("/photos?session=existing");sessionStorage.clear();
  expect(lireRetour()?.workspaceId).toBe("workspace-a");
  setRetourScope("b","workspace-b");expect(lireRetour()).toBeNull();
  setRetourScope("a","workspace-b");expect(lireRetour()?.workspaceId).toBe("workspace-a");
  oublieRetour();expect(lireRetour()).toBeNull();
 });
 it("rejects browser-normalized external paths",()=>{memoriseRetour('/\\evil.test');expect(lireRetour()).toBeNull();});
});
