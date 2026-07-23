import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./Login";

const root = document.getElementById("root");

if (root) {
    createRoot(root).render(
        <StrictMode>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="*" element={<Login />} />
                </Routes>
            </BrowserRouter>
        </StrictMode>
    );
}

