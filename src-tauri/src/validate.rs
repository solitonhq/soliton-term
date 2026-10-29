//! Backend-side validation of everything the WebView sends us.
//!
//! The frontend is not a trust boundary: imported bundles and IPC payloads are
//! checked here before they reach SQLite or, later, an SSH/PTY process.

use crate::db::{AliasItem, CredentialItem, HostEntry, HostGroup, SnippetItem, VaultSnapshot};
use crate::ssh_pty::{is_safe_alias_name, is_safe_ssh_hostname, is_safe_ssh_username};

pub const MAX_ITEMS_PER_KIND: usize = 10_000;
pub const MAX_SECRET_BYTES: usize = 64 * 1024;
const MAX_TAGS: usize = 50;

type Check = Result<(), String>;

fn text(field: &str, v: &str, max: usize, multiline: bool) -> Check {
    if v.chars().count() > max {
        return Err(format!("{field} is longer than {max} characters"));
    }
    let bad = v
        .chars()
        .any(|c| c.is_control() && !(multiline && matches!(c, '\n' | '\r' | '\t')));
    if bad {
        return Err(format!("{field} contains control characters"));
    }
    Ok(())
}

fn required(field: &str, v: &str, max: usize) -> Check {
    if v.trim().is_empty() {
        return Err(format!("{field} is required"));
    }
    text(field, v, max, false)
}

fn id(field: &str, v: &str) -> Check {
    let ok = !v.is_empty()
        && v.len() <= 128
        && v.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if ok {
        Ok(())
    } else {
        Err(format!("{field} must be 1-128 chars of [A-Za-z0-9._-]"))
    }
}

pub fn group(g: &HostGroup) -> Check {
    id("group id", &g.id)?;
    required("group name", &g.name, 200)?;
    if let Some(p) = &g.parent_id {
        id("group parent id", p)?;
        if p == &g.id {
            return Err("a group cannot be its own parent".into());
        }
    }
    text("group icon", g.icon.as_deref().unwrap_or(""), 64, false)
}

pub fn credential(c: &CredentialItem) -> Check {
    id("credential id", &c.id)?;
    required("credential name", &c.name, 200)?;
    if !c.username.is_empty() && !is_safe_ssh_username(&c.username) {
        return Err("credential username contains unsupported characters".into());
    }
    if !matches!(c.secret_type.as_str(), "password" | "ssh_key") {
        return Err("credential secret type must be 'password' or 'ssh_key'".into());
    }
    if c.secret_value.len() > MAX_SECRET_BYTES {
        return Err("credential secret is too large".into());
    }
    text(
        "credential description",
        c.description.as_deref().unwrap_or(""),
        2_000,
        true,
    )
}

pub fn host(h: &HostEntry) -> Check {
    id("host id", &h.id)?;
    required("host name", &h.name, 200)?;
    if !is_safe_ssh_hostname(&h.hostname) {
        return Err(format!("invalid hostname '{}'", h.hostname));
    }
    if h.port == 0 {
        return Err("port must be between 1 and 65535".into());
    }
    id("host group id", &h.group_id)?;
    // Empty = no stored credential (authenticate interactively / via ssh-agent).
    if !h.credential_id.is_empty() {
        id("host credential id", &h.credential_id)?;
    }
    if h.tags.len() > MAX_TAGS {
        return Err(format!("a host can have at most {MAX_TAGS} tags"));
    }
    for t in &h.tags {
        required("tag", t, 64)?;
    }
    text("host os", h.os.as_deref().unwrap_or(""), 32, false)?;
    text("host notes", h.notes.as_deref().unwrap_or(""), 10_000, true)
}

pub fn snippet(s: &SnippetItem) -> Check {
    id("snippet id", &s.id)?;
    required("snippet name", &s.name, 200)?;
    if s.command.trim().is_empty() {
        return Err("snippet command is required".into());
    }
    // Multi-line commands are legitimate for snippets.
    text("snippet command", &s.command, 16_000, true)?;
    text("snippet category", &s.category, 100, false)?;
    text("snippet description", &s.description, 2_000, true)
}

pub fn alias(a: &AliasItem) -> Check {
    id("alias id", &a.id)?;
    if !is_safe_alias_name(&a.alias) {
        return Err("alias name must match [A-Za-z0-9_-]{1,64}".into());
    }
    required("alias command", &a.command, 4_096)?;
    text("alias description", &a.description, 2_000, true)
}

/// Validates an entire bundle up-front so an import is all-or-nothing.
pub fn snapshot(s: &VaultSnapshot) -> Check {
    let counts = [
        ("groups", s.groups.len()),
        ("credentials", s.credentials.len()),
        ("hosts", s.hosts.len()),
        ("snippets", s.snippets.len()),
        ("aliases", s.aliases.len()),
    ];
    for (name, n) in counts {
        if n > MAX_ITEMS_PER_KIND {
            return Err(format!(
                "bundle has too many {name} (max {MAX_ITEMS_PER_KIND})"
            ));
        }
    }
    s.groups.iter().try_for_each(group)?;
    s.credentials.iter().try_for_each(credential)?;
    s.hosts.iter().try_for_each(host)?;
    s.snippets.iter().try_for_each(snippet)?;
    s.aliases.iter().try_for_each(alias)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn good_host() -> HostEntry {
        HostEntry {
            id: "host-1".into(),
            name: "web".into(),
            hostname: "10.0.0.5".into(),
            port: 22,
            group_id: "grp-1".into(),
            credential_id: "cred-1".into(),
            tags: vec!["prod".into()],
            os: Some("linux".into()),
            inject_aliases: true,
            notes: None,
        }
    }

    #[test]
    fn accepts_a_well_formed_host() {
        assert!(host(&good_host()).is_ok());
    }

    #[test]
    fn rejects_option_injection_in_hostname() {
        let mut h = good_host();
        h.hostname = "-oProxyCommand=evil".into();
        assert!(host(&h).is_err());
    }

    #[test]
    fn host_without_credential_is_allowed() {
        let mut h = good_host();
        h.credential_id = String::new();
        assert!(host(&h).is_ok());
    }

    #[test]
    fn rejects_port_zero_and_bad_ids() {
        let mut h = good_host();
        h.port = 0;
        assert!(host(&h).is_err());
        let mut h = good_host();
        h.id = "../etc".into();
        assert!(host(&h).is_err());
    }

    #[test]
    fn rejects_control_characters_in_names() {
        let mut h = good_host();
        h.name = "a\u{1b}[31mb".into();
        assert!(host(&h).is_err());
    }

    #[test]
    fn alias_names_are_restricted() {
        let a = AliasItem {
            id: "al-1".into(),
            alias: "ll; rm -rf /".into(),
            command: "ls".into(),
            description: String::new(),
            enabled: true,
        };
        assert!(alias(&a).is_err());
    }

    #[test]
    fn group_cannot_parent_itself() {
        let g = HostGroup {
            id: "g".into(),
            name: "G".into(),
            parent_id: Some("g".into()),
            icon: None,
        };
        assert!(group(&g).is_err());
    }

    #[test]
    fn credential_requires_known_secret_type() {
        let c = CredentialItem {
            id: "c".into(),
            name: "C".into(),
            username: "root".into(),
            secret_type: "token".into(),
            secret_value: "x".into(),
            description: None,
        };
        assert!(credential(&c).is_err());
    }

    #[test]
    fn snapshot_is_rejected_when_any_item_is_invalid() {
        let mut bad = good_host();
        bad.hostname = "bad host".into();
        let snap = VaultSnapshot {
            groups: vec![],
            credentials: vec![],
            hosts: vec![good_host(), bad],
            snippets: vec![],
            aliases: vec![],
        };
        assert!(snapshot(&snap).is_err());
    }
}
