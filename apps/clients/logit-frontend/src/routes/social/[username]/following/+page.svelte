<script lang="ts">
  import { page } from "$app/state";
  import FollowList from "$lib/components/social/FollowList.svelte";
</script>

<FollowList username={page.params.username ?? ""} mode="following" />
