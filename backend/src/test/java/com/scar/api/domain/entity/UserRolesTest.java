package com.scar.api.domain.entity;

import com.scar.api.domain.enums.UserRole;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

class UserRolesTest {
    @Test
    void editingAnOrdinaryMemberRetainsTheManagedCollection() {
        User user = new User();
        Set<UserRole> managed = user.getRoles();
        user.setRoles(Set.of(UserRole.SECRETARY));
        assertEquals(Set.of(UserRole.SECRETARY), managed);
        user.setRoles(Set.of());
        assertSame(managed, user.getRoles());
        assertEquals(Set.of(), managed);
    }
}
