import {StudentCourses} from './features/training/StudentCourses';
import {AdminCourses} from './features/training/AdminCourses';
import {CompactDashboard,CompactTests} from './features/student/CompactDashboard';
import {GuidanceResults} from './features/student/GuidanceResults';
import {AdminResults} from './features/admin/AdminResults';
import {InstitutionalOverview as CompactAdmin} from './features/admin/InstitutionalOverview';
import {Groups} from './features/admin/Groups';
import {Schools} from './features/admin/Schools';
import {Settings} from './features/admin/Settings';
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { View } from "./types";
import { views, adminNav } from "./data/navigation";
import { interests, preferences, awareness } from "./data/instruments";
import { DemoToolbar, AppShell, FocusShell } from "./components/layout/Shells";
import { Questionnaire } from "./components/domain/Questionnaire";
import { PublicHome, PublicResources } from "./features/public/PublicHome";
import { AuthPage } from "./features/auth/AuthPage";

import { Profile } from "./features/student/Account";
import { ManagedUsers as Users } from "./features/admin/ManagedUsers";
import { EvaluationEditor } from "./features/admin/Editor";
import { TestManager } from "./features/admin/TestManager";

import { CustomAssessment } from "./features/student/CustomTests";
export default function App({ view, navigate }: { view: View; navigate: (view: View) => void }) {
  useEffect(() => {
    document.title =
      (views.find((v) => v.id === view)?.label || "Componentes") +
      " · Ruta Vocacional 360°";
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("main h1")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);
  let page: ReactNode;
  switch (view) {
    case "catalogo":
      page = <PublicHome navigate={navigate} />;
      break;
    case "inicio":
      page = <PublicHome navigate={navigate} />;
      break;
    case "biblioteca":
      page = <PublicResources navigate={navigate} />;
      break;
    case "ingresar":
      page = <AuthPage mode="login" navigate={navigate} />;
      break;
    case "registro":
      page = <AuthPage mode="register" navigate={navigate} />;
      break;
    case "recuperar":
      page = <AuthPage mode="reset" navigate={navigate} />;
      break;
    case "admin-ingresar":
      page = <AuthPage mode="admin" navigate={navigate} />;
      break;
    case "custom-test":
      page = <CustomAssessment navigate={navigate}/>;
      break;
    case "intereses":
    case "valores":
    case "autoconocimiento": {
      const instrument =
        view === "intereses"
          ? interests
          : view === "valores"
            ? preferences
            : awareness;
      page = (
        <FocusShell title={instrument.title} navigate={navigate}>
          <Questionnaire
            key={view}
            instrument={instrument}
            navigate={navigate}
          />
        </FocusShell>
      );
      break;
    }
    default: {
      let content: ReactNode;
      switch (view) {
        case "cursos": content=<StudentCourses/>; break;
        case "admin-cursos": content=<AdminCourses/>; break;
        case "mi-ruta":
          content = <CompactDashboard />;
          break;
        case "evaluaciones":
          content = <CompactTests />;
          break;
        case "resultados":
          content = <GuidanceResults />;
          break;
        case "carreras":
          content = <CompactDashboard />;
          break;
        case "mi-plan":
          content = <CompactDashboard />;
          break;
        case "reflexiones":
          content = <CompactDashboard />;
          break;
        case "recursos":
          content = <CompactDashboard />;
          break;
        case "emprendimiento":
          content = <CompactDashboard />;
          break;
        case "admin-cuenta":
        case "mi-perfil":
          content = <Profile />;
          break;
        case "laboratorio":
          content = <CompactDashboard />;
          break;
        case "admin":
          content = <CompactAdmin navigate={navigate} />;
          break;
        case "admin-resultados":
          content = <AdminResults />;
          break;
        case "usuarios":
          content = <Users />;
          break;
        case "escuelas":
          content = <Schools />;
          break;
        case "grupos":
          content = <CompactAdmin navigate={navigate} />;
          break;
        case "editor":
          content = <TestManager />;
          break;
        case "contenidos":
          content = <CompactAdmin navigate={navigate} />;
          break;
        case "reportes":
          content = <CompactAdmin navigate={navigate} />;
          break;
        case "ajustes":
          content = <Settings />;
          break;
        default:
          content = <CompactDashboard />;
      }
      page = (
        <AppShell
          view={view}
          navigate={navigate}
          admin={view==='admin-cuenta'||adminNav.some((v) => v.id === view)}
        >
          {content}
        </AppShell>
      );
    }
  }
  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>

      {page}
    </>
  );
}
