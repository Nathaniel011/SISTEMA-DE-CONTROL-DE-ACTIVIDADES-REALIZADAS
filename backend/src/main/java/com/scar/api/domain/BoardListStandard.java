package com.scar.api.domain;

import java.util.List;

public final class BoardListStandard {

    public static final List<String> NAMES = List.of(
        "Asignado",
        "En proceso",
        "Pendiente",
        "Hecho"
    );

    public static final String TASK_LIST_NAME = "Tarea";

    private BoardListStandard() {
    }
}
