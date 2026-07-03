package com.scar.api.domain.enums;

public enum IssueType {
    OPERACION,
    FEATURE,
    ANALISIS_UI,
    UI,
    ANALISIS,
    DESPLIEGUE,
    PRUEBAS,
    CORRECCION,
    MIGRACION,
    QA;

    public String label() {
        return switch (this) {
            case OPERACION -> "Operación";
            case FEATURE -> "Feature";
            case ANALISIS_UI -> "Análisis/UI";
            case UI -> "UI";
            case ANALISIS -> "Análisis";
            case DESPLIEGUE -> "Despliegue";
            case PRUEBAS -> "Pruebas";
            case CORRECCION -> "Corrección";
            case MIGRACION -> "Migración";
            case QA -> "QA";
        };
    }
}
