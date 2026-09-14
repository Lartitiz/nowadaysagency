import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import SharedBrandingPage from "@/pages/SharedBrandingPage";
const payload = { profile: { prenom: "Alice" }, offers: [], personas: [{ id: "p1", label: "Public A", step_1_frustrations: "A frustrations" }, { id: "p2", label: "Public B", step_2_transformation: "B transformation" }], stories: [{ id: "s1", title: "Histoire A", step_7_polished: "Texte A" }, { id: "s2", title: "Histoire B", pitch_short: "Pitch B" }], link: { created_at: "2026-08-16T00:00:00Z", expires_at: "2026-09-15T00:00:00Z" }, read_at: "2026-09-14T12:00:00Z" };
function Navigation() { const navigate = useNavigate(); return <><button onClick={() => navigate('/share/branding/b')}>Go B</button><button onClick={() => navigate('/share/branding/a')}>Go A</button></>; }
const mount = () => render(<MemoryRouter initialEntries={['/share/branding/a']}><Navigation/><Routes><Route path="/share/branding/:token" element={<SharedBrandingPage/>}/></Routes></MemoryRouter>);
beforeEach(() => vi.restoreAllMocks());
describe("shared branding public page", () => {
  it("renders every public and primary story, separates dates from generation", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))); mount();
    expect(await screen.findByText('Public B')).toBeInTheDocument(); expect(screen.getByText('Public A')).toBeInTheDocument();
    expect(screen.getByText('Histoire B')).toBeInTheDocument(); expect(screen.getByText('Pitch B')).toBeInTheDocument();
    expect(screen.getByText(/Lien créé le/)).toHaveTextContent('16/08/2026'); expect(screen.queryByText(/Générée/)).not.toBeInTheDocument();
  });
  it("distinguishes transient read failure and retries the same token", async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:'Lecture impossible'}),{status:503})).mockResolvedValueOnce(new Response(JSON.stringify(payload))); vi.stubGlobal('fetch',fetcher); mount();
    expect(await screen.findByText('Lecture impossible')).toBeInTheDocument(); fireEvent.click(screen.getByText('Réessayer'));
    expect(await screen.findByText('Public A')).toBeInTheDocument(); expect(fetcher.mock.calls[0][0]).toBe(fetcher.mock.calls[1][0]);
  });
  it("revoked links do not masquerade as network errors", async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Lien révoqué'}),{status:404}))); mount();
    expect(await screen.findByText('Lien révoqué')).toBeInTheDocument(); expect(screen.queryByText('Réessayer')).not.toBeInTheDocument();
  });
  it("late A response cannot overwrite B or a later visit to A", async () => {
    let resolveA!: (r:Response)=>void; const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(r=>resolveA=r)).mockResolvedValueOnce(new Response(JSON.stringify({...payload,profile:{prenom:'B'}}))).mockResolvedValueOnce(new Response(JSON.stringify({...payload,profile:{prenom:'New A'}}))); vi.stubGlobal('fetch',fetcher); mount();
    fireEvent.click(screen.getByText('Go B')); expect(await screen.findByText('Synthèse Branding de B')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Go A')); expect(await screen.findByText('Synthèse Branding de New A')).toBeInTheDocument();
    await act(async()=>resolveA(new Response(JSON.stringify(payload)))); expect(screen.queryByText('Synthèse Branding de Alice')).not.toBeInTheDocument();
  });
});
